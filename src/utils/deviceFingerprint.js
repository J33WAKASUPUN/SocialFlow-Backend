const crypto = require('crypto');

/**
 * Generate a unique device fingerprint based on request headers
 */
function generateDeviceFingerprint(req) {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Combine identifiers
  const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${ipAddress}`;
  
  // Hash to create device ID (SHA-256)
  const deviceId = crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex');
  
  return deviceId;
}

/**
 * Extract device name from user agent
 */
function getDeviceName(userAgent) {
  if (!userAgent) return 'Unknown Device';
  
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  
  // Detect browser
  if (userAgent.includes('Edg/')) browser = 'Edge';
  else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) browser = 'Chrome';
  else if (userAgent.includes('Firefox/')) browser = 'Firefox';
  else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) browser = 'Safari';
  else if (userAgent.includes('OPR/') || userAgent.includes('Opera/')) browser = 'Opera';
  
  // Detect OS
  if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10';
  else if (userAgent.includes('Windows NT')) os = 'Windows';
  else if (userAgent.includes('Mac OS X')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  
  return `${browser} on ${os}`;
}

/**
 * Get location from IP (optional - requires GeoIP library)
 * Install: npm install geoip-lite
 */
function getLocationFromIP(ipAddress) {
  try {
    // Example using geoip-lite (you need to install it)
    const geoip = require('geoip-lite');
    const geo = geoip.lookup(ipAddress);
    
    if (geo) {
      return {
        country: geo.country,
        city: geo.city || 'Unknown',
      };
    }
  } catch (error) {
    // Silently fail if geoip-lite is not installed
  }
  
  return {
    country: 'Unknown',
    city: 'Unknown',
  };
}

module.exports = {
  generateDeviceFingerprint,
  getDeviceName,
  getLocationFromIP,
};