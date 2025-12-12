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
  else if (userAgent.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (userAgent.includes('Windows NT 6.2')) os = 'Windows 8';
  else if (userAgent.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (userAgent.includes('Windows NT')) os = 'Windows';
  else if (userAgent.includes('Mac OS X 10_15')) os = 'macOS Catalina';
  else if (userAgent.includes('Mac OS X 10_14')) os = 'macOS Mojave';
  else if (userAgent.includes('Mac OS X')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone')) os = 'iOS (iPhone)';
  else if (userAgent.includes('iPad')) os = 'iOS (iPad)';
  
  return `${browser} on ${os}`;
}

/**
 * Get location from IP using geoip-lite
 */
function getLocationFromIP(ipAddress) {
  try {
    // ✅ Import geoip-lite (must be installed: npm install geoip-lite)
    const geoip = require('geoip-lite');
    
    // Handle localhost/private IPs
    if (!ipAddress || 
        ipAddress === '::1' || 
        ipAddress === '127.0.0.1' || 
        ipAddress.startsWith('192.168.') ||
        ipAddress.startsWith('10.') ||
        ipAddress.startsWith('172.')) {
      return {
        country: 'Local',
        city: 'Development',
      };
    }

    // Clean IPv6-mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
    const cleanIP = ipAddress.replace(/^::ffff:/, '');
    
    const geo = geoip.lookup(cleanIP);
    
    if (geo) {
      return {
        country: geo.country || 'Unknown',
        city: geo.city || 'Unknown',
      };
    }
    
    return {
      country: 'Unknown',
      city: 'Unknown',
    };
  } catch (error) {
    console.error('GeoIP lookup error:', error.message);
    return {
      country: 'Unknown',
      city: 'Unknown',
    };
  }
}

module.exports = {
  generateDeviceFingerprint,
  getDeviceName,
  getLocationFromIP,
};