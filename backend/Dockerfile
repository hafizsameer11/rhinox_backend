# Base image
FROM node:20-alpine

# Set workdir
WORKDIR /app

# Copy package manifests and install deps
COPY package*.json ./
RUN npm install

# Copy rest of the code
COPY . .

# Expose app port
EXPOSE 3000

# Run the dev server (use nodemon if you prefer auto reload)
CMD ["npm", "run", "dev"]
