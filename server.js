import('dotenv/config')

import express from 'express';
import cors from 'cors';

import BigFinishProvider from './provider.js'; 

const app = express();
const port = process.env.PORT || 3001;


process.env.USE_CORS === 'true' && app.use(cors());

// Middleware to check for AUTHORIZATION header (optional for now)
process.env.USE_AUTH === 'true' && app.use((req, res, next) => {
 const apiKey = req.headers['authorization'];
 if (!apiKey) {
   return res.status(401).json({ error: 'Unauthorized' });
 }
 next();
});

const provider = new BigFinishProvider();

// Search route
app.get('/search', async (req, res) => {
  try {
    console.log('Received search request:', req.query);
    const query = req.query.query;
    const author = req.query.author;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const results = await provider.searchBooks(query, author);

    // Format results according to OpenAPI specification
    const formattedResults = {
      matches: results.matches.filter(b => !!b.title).map(book => ({
        title: book.title,
        subtitle: book.subtitle || undefined,
        author: book.authors ? book.authors.join(', ') : undefined, // List authors if available
        narrator: book.narrator || undefined,
        description: book.description ? (typeof book.description === 'string' ? book.description : book.description.description) : undefined, // Only include matching story's description
        cover: book.cover || undefined,
        duration: book.duration || undefined,
        type: book.type || undefined,
        publishedYear: book.publishedYear || undefined, // Include the published year
        publisher: book.publisher || 'Big Finish Productions', // Always include publisher
        series: book.series || undefined,
      }))
    };

    console.log('Sending response:', JSON.stringify(formattedResults, null, 2));
    res.json(formattedResults);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`BigFinish provider listening on port ${port}`);
});
