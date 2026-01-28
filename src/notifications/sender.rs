use anyhow::{anyhow, Result};
use lettre::{
    message::header::ContentType,
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use reqwest::Client;
use serde_json::json;
use tracing::{error, info, warn};

use crate::realtime::alerts::AlertNotification;
use super::channels::{ChannelConfig, NotificationChannel};

/// Notification sender that handles all channel types
pub struct NotificationSender {
    http_client: Client,
}

impl NotificationSender {
    pub fn new() -> Self {
        Self {
            http_client: Client::new(),
        }
    }

    /// Send a notification to a channel
    pub async fn send(
        &self,
        channel: &NotificationChannel,
        notification: &AlertNotification,
    ) -> Result<()> {
        if !channel.enabled {
            warn!("Channel {} is disabled, skipping", channel.name);
            return Ok(());
        }

        match &channel.config {
            ChannelConfig::Slack { .. } => self.send_slack(channel, notification).await,
            ChannelConfig::Discord { .. } => self.send_discord(channel, notification).await,
            ChannelConfig::PagerDuty { .. } => self.send_pagerduty(channel, notification).await,
            ChannelConfig::Email { .. } => self.send_email(channel, notification).await,
            ChannelConfig::Webhook { .. } => self.send_webhook(channel, notification).await,
        }
    }

    /// Send notification to Slack
    async fn send_slack(
        &self,
        channel: &NotificationChannel,
        notification: &AlertNotification,
    ) -> Result<()> {
        let ChannelConfig::Slack {
            webhook_url,
            channel: slack_channel,
            username,
            icon_emoji,
        } = &channel.config
        else {
            return Err(anyhow!("Invalid config for Slack channel"));
        };

        let color = if notification.current_value > notification.threshold * 1.5 {
            "#dc3545" // Red for critical
        } else {
            "#ffc107" // Yellow for warning
        };

        let mut payload = json!({
            "attachments": [{
                "color": color,
                "title": format!("🚨 Alert: {}", notification.alert_name),
                "text": notification.message,
                "fields": [
                    {
                        "title": "Condition",
                        "value": notification.condition,
                        "short": true
                    },
                    {
                        "title": "Current Value",
                        "value": format!("{:.2}", notification.current_value),
                        "short": true
                    },
                    {
                        "title": "Threshold",
                        "value": format!("{:.2}", notification.threshold),
                        "short": true
                    },
                    {
                        "title": "Time",
                        "value": notification.timestamp.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
                        "short": true
                    }
                ],
                "footer": "Kartex Logging Server",
                "ts": notification.timestamp.timestamp()
            }]
        });

        if let Some(ch) = slack_channel {
            payload["channel"] = json!(ch);
        }
        if let Some(user) = username {
            payload["username"] = json!(user);
        }
        if let Some(emoji) = icon_emoji {
            payload["icon_emoji"] = json!(emoji);
        }

        let response = self
            .http_client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!("Slack webhook failed: {} - {}", status, body);
            return Err(anyhow!("Slack webhook failed: {}", status));
        }

        info!("Slack notification sent to channel {}", channel.name);
        Ok(())
    }

    /// Send notification to Discord
    async fn send_discord(
        &self,
        channel: &NotificationChannel,
        notification: &AlertNotification,
    ) -> Result<()> {
        let ChannelConfig::Discord {
            webhook_url,
            username,
            avatar_url,
        } = &channel.config
        else {
            return Err(anyhow!("Invalid config for Discord channel"));
        };

        let color = if notification.current_value > notification.threshold * 1.5 {
            0xdc3545 // Red
        } else {
            0xffc107 // Yellow
        };

        let mut payload = json!({
            "embeds": [{
                "title": format!("🚨 Alert: {}", notification.alert_name),
                "description": notification.message,
                "color": color,
                "fields": [
                    {
                        "name": "Condition",
                        "value": notification.condition,
                        "inline": true
                    },
                    {
                        "name": "Current Value",
                        "value": format!("{:.2}", notification.current_value),
                        "inline": true
                    },
                    {
                        "name": "Threshold",
                        "value": format!("{:.2}", notification.threshold),
                        "inline": true
                    }
                ],
                "timestamp": notification.timestamp.to_rfc3339(),
                "footer": {
                    "text": "Kartex Logging Server"
                }
            }]
        });

        if let Some(user) = username {
            payload["username"] = json!(user);
        }
        if let Some(avatar) = avatar_url {
            payload["avatar_url"] = json!(avatar);
        }

        let response = self
            .http_client
            .post(webhook_url)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!("Discord webhook failed: {} - {}", status, body);
            return Err(anyhow!("Discord webhook failed: {}", status));
        }

        info!("Discord notification sent to channel {}", channel.name);
        Ok(())
    }

    /// Send notification to PagerDuty
    async fn send_pagerduty(
        &self,
        channel: &NotificationChannel,
        notification: &AlertNotification,
    ) -> Result<()> {
        let ChannelConfig::PagerDuty {
            routing_key,
            severity,
        } = &channel.config
        else {
            return Err(anyhow!("Invalid config for PagerDuty channel"));
        };

        let severity = severity.as_deref().unwrap_or_else(|| {
            if notification.current_value > notification.threshold * 2.0 {
                "critical"
            } else if notification.current_value > notification.threshold * 1.5 {
                "error"
            } else {
                "warning"
            }
        });

        let payload = json!({
            "routing_key": routing_key,
            "event_action": "trigger",
            "dedup_key": format!("kartex-{}", notification.alert_name.to_lowercase().replace(' ', "-")),
            "payload": {
                "summary": notification.message,
                "source": "Kartex Logging Server",
                "severity": severity,
                "timestamp": notification.timestamp.to_rfc3339(),
                "custom_details": {
                    "alert_name": notification.alert_name,
                    "condition": notification.condition,
                    "current_value": notification.current_value,
                    "threshold": notification.threshold
                }
            }
        });

        let response = self
            .http_client
            .post("https://events.pagerduty.com/v2/enqueue")
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!("PagerDuty API failed: {} - {}", status, body);
            return Err(anyhow!("PagerDuty API failed: {}", status));
        }

        info!("PagerDuty notification sent to channel {}", channel.name);
        Ok(())
    }

    /// Send notification via Email
    async fn send_email(
        &self,
        channel: &NotificationChannel,
        notification: &AlertNotification,
    ) -> Result<()> {
        let ChannelConfig::Email {
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            from_address,
            to_addresses,
            use_tls,
        } = &channel.config
        else {
            return Err(anyhow!("Invalid config for Email channel"));
        };

        let subject = format!("🚨 Kartex Alert: {}", notification.alert_name);

        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }}
        .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .header {{ background: #dc3545; color: white; padding: 20px; }}
        .header h1 {{ margin: 0; font-size: 20px; }}
        .content {{ padding: 20px; }}
        .message {{ font-size: 16px; color: #333; margin-bottom: 20px; }}
        .details {{ background: #f8f9fa; border-radius: 4px; padding: 15px; }}
        .detail-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }}
        .detail-row:last-child {{ border-bottom: none; }}
        .detail-label {{ color: #666; }}
        .detail-value {{ font-weight: 600; color: #333; }}
        .footer {{ padding: 15px 20px; background: #f8f9fa; color: #666; font-size: 12px; text-align: center; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Alert: {alert_name}</h1>
        </div>
        <div class="content">
            <div class="message">{message}</div>
            <div class="details">
                <div class="detail-row">
                    <span class="detail-label">Condition</span>
                    <span class="detail-value">{condition}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Current Value</span>
                    <span class="detail-value">{current_value:.2}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Threshold</span>
                    <span class="detail-value">{threshold:.2}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time</span>
                    <span class="detail-value">{timestamp}</span>
                </div>
            </div>
        </div>
        <div class="footer">
            Sent by Kartex Logging Server
        </div>
    </div>
</body>
</html>"#,
            alert_name = notification.alert_name,
            message = notification.message,
            condition = notification.condition,
            current_value = notification.current_value,
            threshold = notification.threshold,
            timestamp = notification.timestamp.format("%Y-%m-%d %H:%M:%S UTC")
        );

        for to_address in to_addresses {
            let email = Message::builder()
                .from(from_address.parse()?)
                .to(to_address.parse()?)
                .subject(&subject)
                .header(ContentType::TEXT_HTML)
                .body(html_body.clone())?;

            let mailer = if *use_tls {
                if let (Some(username), Some(password)) = (smtp_username, smtp_password) {
                    AsyncSmtpTransport::<Tokio1Executor>::relay(smtp_host)?
                        .port(*smtp_port)
                        .credentials(Credentials::new(username.clone(), password.clone()))
                        .build()
                } else {
                    AsyncSmtpTransport::<Tokio1Executor>::relay(smtp_host)?
                        .port(*smtp_port)
                        .build()
                }
            } else {
                if let (Some(username), Some(password)) = (smtp_username, smtp_password) {
                    AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(smtp_host)
                        .port(*smtp_port)
                        .credentials(Credentials::new(username.clone(), password.clone()))
                        .build()
                } else {
                    AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(smtp_host)
                        .port(*smtp_port)
                        .build()
                }
            };

            mailer.send(email).await?;
            info!("Email notification sent to {}", to_address);
        }

        Ok(())
    }

    /// Send notification via generic Webhook
    async fn send_webhook(
        &self,
        channel: &NotificationChannel,
        notification: &AlertNotification,
    ) -> Result<()> {
        let ChannelConfig::Webhook {
            url,
            method,
            headers,
        } = &channel.config
        else {
            return Err(anyhow!("Invalid config for Webhook channel"));
        };

        let method = method.as_deref().unwrap_or("POST");

        let mut request = match method.to_uppercase().as_str() {
            "GET" => self.http_client.get(url),
            "PUT" => self.http_client.put(url).json(notification),
            _ => self.http_client.post(url).json(notification),
        };

        if let Some(hdrs) = headers {
            for (key, value) in hdrs {
                request = request.header(key, value);
            }
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!("Webhook failed: {} - {}", status, body);
            return Err(anyhow!("Webhook failed: {}", status));
        }

        info!("Webhook notification sent to channel {}", channel.name);
        Ok(())
    }

    /// Send a test notification
    pub async fn send_test(
        &self,
        channel: &NotificationChannel,
        message: Option<String>,
    ) -> Result<()> {
        let test_notification = AlertNotification {
            alert_name: "Test Alert".to_string(),
            condition: "Test condition".to_string(),
            current_value: 100.0,
            threshold: 50.0,
            timestamp: chrono::Utc::now(),
            message: message.unwrap_or_else(|| "This is a test notification from Kartex Logging Server".to_string()),
        };

        self.send(channel, &test_notification).await
    }
}

impl Default for NotificationSender {
    fn default() -> Self {
        Self::new()
    }
}
