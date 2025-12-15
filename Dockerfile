# Use Node.js LTS (Long Term Support) version
FROM node:20-alpine
# Set working directory
WORKDIR /app

# Install pnpm globally (since you use pnpm-lock.yaml)
RUN npm install -g pnpm

# Copy dependency files first for better caching
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN pnpm build

# Expose the port Next.js runs on
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]