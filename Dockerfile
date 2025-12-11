# # Use Node 20 Alpine
# FROM node:20-alpine

# # Set working directory
# WORKDIR /app

# # Install system dependencies
# RUN apk add --no-cache python3 make g++ ffmpeg

# # Copy package files
# COPY package*.json ./

# # Use standard install to ensure no modules are missing
# RUN npm install

# # Copy application code
# COPY . .

# # Create logs directory
# RUN mkdir -p logs

# # Set environment variables
# ENV NODE_ENV=production
# ENV PORT=5000

# # Expose port
# EXPOSE 5000

# # FORCE NODE EXECUTION
# # We use the "exec" form (brackets) to prevent shell wrapping issues
# CMD ["node", "src/server.js"]