# Amawell Scraper Server

A production-ready server for scraping Amawell product data via API endpoints. Designed for Railway deployment with optimized Chrome/Chromium support.

## Features

- 🚀 **Production Ready**: Optimized for Railway deployment
- 🔒 **Security**: Rate limiting, CORS, and security headers
- 🕷️ **Stealth Scraping**: Uses puppeteer-extra with stealth plugin
- 📊 **API Endpoints**: RESTful API for scraping operations
- 🏥 **Health Checks**: Built-in health monitoring
- ⚡ **Performance**: Optimized browser settings for server environments

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Test the API:
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amawell.sk/prstene/", "maxProducts": 5}'
```

### Railway Deployment

1. Push to your GitHub repository
2. Connect your repo to Railway
3. Deploy automatically - Railway will detect the configuration files

## API Endpoints

### Health Check
```bash
GET /health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### Scrape Products
```bash
POST /api/scrape
```

**Request Body:**
```json
{
  "url": "https://www.amawell.sk/prstene/",
  "maxProducts": 10
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scrapedUrl": "https://www.amawell.sk/prstene/",
    "products": [
      {
        "product_id": "12345",
        "product-name": "Product Name",
        "url": "https://www.amawell.sk/product-url",
        "price": "299.99",
        "is_new": "Nové",
        "image": {
          "src": "image-url",
          "alt": "Product image"
        },
        "stock-status": "Skladem",
        "delivery-info": "Doručení do 24h",
        "sku": "SKU123"
      }
    ],
    "totalProducts": 1,
    "maxProducts": 10,
    "duration": "5000ms"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (production/development)

### Rate Limiting

- 10 requests per minute per IP address
- Configurable in `server.js`

## Railway-Specific Features

### Chrome/Chromium Support
- Automatically installs Chromium via nixpacks
- Includes all necessary dependencies
- Optimized for server environments

### CA Certificates
- Includes CA certificates for HTTPS support
- Handles SSL/TLS connections properly

### Build Optimization
- Uses nixpacks for consistent builds
- Installs only production dependencies
- Optimized for Railway's infrastructure

## Error Handling

The API returns structured error responses:

```json
{
  "success": false,
  "error": "Error message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

Common error codes:
- `400`: Invalid request (missing URL, invalid Amawell URL)
- `429`: Rate limit exceeded
- `500`: Internal server error

## Security Features

- **Rate Limiting**: Prevents abuse
- **CORS**: Configurable cross-origin requests
- **Helmet**: Security headers
- **Input Validation**: URL and parameter validation
- **Request Filtering**: Blocks unnecessary requests

## Performance Optimizations

- **Browser Optimization**: Disabled unnecessary features
- **Request Blocking**: Blocks ads and analytics
- **Memory Management**: Proper browser cleanup
- **Compression**: Response compression enabled

## Monitoring

### Health Check
Monitor server health with the `/health` endpoint.

### Logs
The server logs all scraping operations and errors for monitoring.

## Troubleshooting

### Common Issues

1. **Chrome not found**: The nixpacks configuration ensures Chromium is installed
2. **CA certificate errors**: CA certificates are included in the build
3. **Memory issues**: Browser is properly closed after each request
4. **Timeout errors**: Increased timeout to 30 seconds for navigation

### Railway Deployment Issues

1. **Build fails**: Check nixpacks.toml configuration
2. **Runtime errors**: Check Railway logs for detailed error messages
3. **Health check fails**: Ensure the `/health` endpoint is accessible

## Development

### Adding New Features

1. Add new endpoints in `server.js`
2. Update rate limiting if needed
3. Test locally before deploying

### Testing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test scraping endpoint
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amawell.sk/prstene/", "maxProducts": 1}'
```

## License

ISC License 