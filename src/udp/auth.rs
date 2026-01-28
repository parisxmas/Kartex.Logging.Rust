use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub struct AuthValidator {
    secret: Vec<u8>,
}

impl AuthValidator {
    pub fn new(secret: &str) -> Self {
        Self {
            secret: secret.as_bytes().to_vec(),
        }
    }

    /// Validates the HMAC signature of the packet
    /// Packet format: [32-byte HMAC signature][payload]
    pub fn validate<'a>(&self, packet: &'a [u8]) -> Result<&'a [u8], AuthError> {
        if packet.len() < 32 {
            return Err(AuthError::PacketTooShort);
        }

        let (signature, payload) = packet.split_at(32);
        
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .map_err(|_| AuthError::InvalidKey)?;
        mac.update(payload);
        
        let expected = mac.finalize().into_bytes();
        
        if signature != expected.as_slice() {
            return Err(AuthError::InvalidSignature);
        }

        Ok(payload)
    }

    /// Generates HMAC signature for a payload (useful for clients)
    pub fn sign(&self, payload: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .expect("HMAC can take key of any size");
        mac.update(payload);
        mac.finalize().into_bytes().to_vec()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Packet too short, minimum 32 bytes required for signature")]
    PacketTooShort,
    #[error("Invalid authentication key")]
    InvalidKey,
    #[error("Invalid signature")]
    InvalidSignature,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sign_and_validate() {
        let validator = AuthValidator::new("test-secret");
        let payload = b"test log message";
        
        let signature = validator.sign(payload);
        let mut packet = signature;
        packet.extend_from_slice(payload);
        
        let result = validator.validate(&packet);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), payload);
    }

    #[test]
    fn test_invalid_signature() {
        let validator = AuthValidator::new("test-secret");
        let payload = b"test log message";
        
        let mut packet = vec![0u8; 32]; // Invalid signature
        packet.extend_from_slice(payload);
        
        let result = validator.validate(&packet);
        assert!(matches!(result, Err(AuthError::InvalidSignature)));
    }
}
