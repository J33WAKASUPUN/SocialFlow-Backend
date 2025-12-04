const LinkedInProvider = require('./linkedInProvider');
const TwitterProvider = require('./twitterProvider');
const FacebookProvider = require('./facebookProvider');
const InstagramProvider = require('./instagramProvider');
const YouTubeProvider = require('./youtubeProvider');

class ProviderFactory {
  static getProvider(providerName, channel = null) {
    switch (providerName.toLowerCase()) {
      case 'linkedin':
        return new LinkedInProvider(channel);
      case 'facebook':
        return new FacebookProvider(channel);
      case 'instagram':
        return new InstagramProvider(channel);
      case 'twitter':
        return new TwitterProvider(channel);
      case 'youtube':
        return new YouTubeProvider(channel);
      default:
        throw new Error(`Provider '${providerName}' is not supported`);
    }
  }

  static getSupportedProviders() {
    return ['linkedin', 'facebook', 'instagram', 'twitter', 'youtube'];
  }

  static isProviderSupported(providerName) {
    return this.getSupportedProviders().includes(providerName.toLowerCase());
  }
}

module.exports = ProviderFactory;