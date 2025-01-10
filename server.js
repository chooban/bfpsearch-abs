const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Middleware to check for AUTHORIZATION header
app.use((req, res, next) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Here you would typically validate the API key
  // For now, we'll just pass it through
  next();
});

class AudiotekaProvider {
  constructor() {
    this.id = 'bigfinish';
    this.name = 'BigFinish';
    this.baseUrl = 'https://www.bigfinish.com';
    this.searchUrl = 'https://bigfinish.com/search_results?search_value_selected=0';
  }

  async searchBooks(query, author = '') {
    try {
      console.log(`Searching for: "${query}" by "${author}"`);
      const searchUrl = `${this.searchUrl}&search_term=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);

      console.log('Search URL:', searchUrl);

      const matches = [];
      const $books = $('.grid-box');
      console.log('Number of books found:', $books.length);

      $books.each((index, element) => {
        const $book = $(element);
        
        const title = $book.find('.title').text().trim();
        const bookUrlElement = $book.find('.grid-content h3.title a');
        
        // Check if the element exists and has the href
        if(bookUrlElement.length > 0){
           const relativeBookUrl = bookUrlElement.attr('href');
        
          let bookUrl = relativeBookUrl ? this.baseUrl + relativeBookUrl : null;
        if (bookUrl) {
           console.log('bookUrl:', bookUrl);
          let cover = $book.find('.grid-pict img').attr('src');
           
            // Make cover absolute
           cover = cover ? this.baseUrl + cover : null;


            const id = $book.attr('data-item-id') || bookUrl.split('/').pop();


          matches.push({
            id,
            title,
            url: bookUrl,
            cover,
            source: {
              id: this.id,
              description: this.name,
              link: this.baseUrl,
            },
          });
        } else {
             console.warn('No valid bookUrl found:', title);
        }

    } else {
        console.warn('No bookUrl element found:', title)
    }
      });

      const fullMetadata = await Promise.all(matches.map(match => this.getFullMetadata(match)));
      return { matches: fullMetadata };
    } catch (error) {
      console.error('Error searching books:', error.message, error.stack);
      return { matches: [] };
    }
  }

  async getFullMetadata(match) {
    try {
      console.log(`Fetching full metadata for: ${match.title}`);
      const response = await axios.get(match.url);
      const $ = cheerio.load(response.data);

      // Get narrator from the "Starring" row in the details table
      const narrators = 
      $('tr:contains("Starring") td:last-child a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(', ');

      // Get authors from the "Written by" row in the details table
      const author = 
      $('tr:contains("Adapted by") td:last-child a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(', ');
  
      // Get duration from the "Duration" row
       const duration = 
        $('li.no-line:contains("Duration:")').text().replace('Duration:','').trim() || null;


      // Get type from the "Product Format:" row
      const type =
         $('li.no-line:contains("Product Format:")').text().replace('Product Format:','').trim()  || null;

      // Get description
      const description = $('.tab-content.active article')
        .map((i, el) => $(el).text().trim())
        .get()
        .join('\n\n');

      // Get main cover image
      let cover = $('.detail-page-image img').attr('src') || match.cover;
        // Make cover absolute
       cover = cover ? this.baseUrl + cover : null;

      const fullMetadata = {
        ...match,
        cover,
        narrator: narrators,
        duration,
        //publisher,
        description,
        type,
        //genres,
        //series: series.length > 0 ? series[0] : undefined, // Taking first series if multiple exist
        //rating,
        //languages,
        authors: author ? author.split(',').map(a=> a.trim()) : [],
        identifiers: {
          audioteka: match.id,
        },
      };

      console.log(`Full metadata for ${match.title}:`, JSON.stringify(fullMetadata, null, 2));
      return fullMetadata;
    } catch (error) {
      console.error(`Error fetching full metadata for ${match.title}:`, error.message, error.stack);
      // Return basic metadata if full metadata fetch fails
      return match;
    }
  }
}

const provider = new AudiotekaProvider();

app.get('/search', async (req, res) => {
  try {
    console.log('Received search request:', req.query);
    const query = req.query.query;
    const author = req.query.author;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const results = await provider.searchBooks(query, author);
    
    // Format the response according to the OpenAPI specification
    const formattedResults = {
      matches: results.matches.map(book => ({
        title: book.title,
        subtitle: book.subtitle || undefined,
        author: book.authors ? book.authors.join(', ') : undefined,
        narrator: book.narrator || undefined,
        //publisher: book.publisher || undefined,
        //publishedYear: book.publishedDate ? new Date(book.publishedDate).getFullYear().toString() : undefined,
        description: book.description || undefined,
        cover: book.cover || undefined,
        //isbn: book.identifiers?.isbn || undefined,
        //asin: book.identifiers?.asin || undefined,
       // genres: book.genres || undefined,
        //tags: book.tags || undefined,
        //series: book.series ? [{
        // series: book.series,
         // sequence: undefined // Audioteka doesn't seem to provide sequence numbers
        //}] : undefined,
        //language: book.languages && book.languages.length > 0 ? book.languages[0] : undefined,
        duration: book.duration || undefined,
        type: book.type || undefined,
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
