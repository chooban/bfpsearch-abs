require('dotenv').config()

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;


process.env.USE_CORS === 'true' ?? app.use(cors());

// Middleware to check for AUTHORIZATION header (optional for now)
process.env.USE_AUTH === 'true' ?? app.use((req, res, next) => {
 const apiKey = req.headers['authorization'];
 if (!apiKey) {
   return res.status(401).json({ error: 'Unauthorized' });
 }
 next();
});

class BigFinishProvider {
  constructor() {
    this.id = 'bigfinish';
    this.name = 'BigFinish';
    this.baseUrl = 'https://www.bigfinish.com';
    this.searchUrl = 'https://bigfinish.com/search_results?search_value_selected=0';
  }

  // Searching for books based on query and optional author
  async searchBooks(query, author = '') {
    try {
      console.log(`Searching for: "${query}" by "${author}"`);
      const searchUrl = `${this.searchUrl}&search_term=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);

      // console.log('Search URL:', searchUrl);

      const matches = [];
      const $books = $('.grid-box'); // Books are in this container
      // console.log('Number of books found:', $books.length);

      $books.each((_index, element) => {
        const $book = $(element);
        
        const title = $book.find('.title').text().trim();
        const bookUrlElement = $book.find('.grid-content h3.title a');
        
        if (bookUrlElement.length > 0) {
          const relativeBookUrl = bookUrlElement.attr('href');
          let bookUrl = relativeBookUrl ? this.baseUrl + relativeBookUrl : null;
          
          if (bookUrl) {
            // console.log('bookUrl:', bookUrl);
            let cover = $book.find('.grid-pict img').attr('src');
            cover = cover ? this.baseUrl + cover : null;

            const id = $book.attr('data-item-id') || bookUrl.split('/').pop();
            
            console.log(`Found book: ${title} (ID: ${id})`);

            matches.push({
              id,
              title: process.env.STRIP_TITLE === 'true' ? title.split(':').slice(1).join(":").trim() : title,
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
          console.warn('No bookUrl element found:', title);
        }
      });

      const fullMetadata = await Promise.all(matches.map(match => this.getFullMetadata(match, query)));
      return { matches: fullMetadata };
    } catch (error) {
      console.error('Error searching books:', error.message, error.stack);
      return { matches: [] };
    }
  }

// Fetching full metadata for each book
async getFullMetadata(match, query) {
  try {
    // console.log(`Fetching full metadata for: ${match.title}`);
    const response = await axios.get(match.url);
    const $ = cheerio.load(response.data);

    // Try to find the "Cast" tab under <div id="tabs">
    let narrators = [];
    const castTabLink = $('#tabs ul li a')
      .filter((i, el) => $(el).text().trim() === 'Cast') // Look for the "Cast" link specifically
      .attr('href');

    if (castTabLink) {
      // console.log('Found Cast tab');
      // Find the corresponding tab content (e.g., #tab5)
      const castTabContent = $(`${castTabLink}`).closest('.tab-content'); // Find the related tab-content

      if (castTabContent.length > 0) {
        // Extract the narrators from the list within the "Cast" tab
        narrators = castTabContent.find('ul li')
          .map((i, el) => {
            const name = $(el).find('a').text().trim();
            return name;
          })
          .get()
          .join(', ');
      }
    }

    // If no "Cast" tab, fall back to the "Starring" list under product description
    if (narrators.length === 0) {
      // console.log('Cast tab not found, falling back to Starring');
      narrators = $('div.product-desc .comma-seperate-links')
        .filter((i, el) => $(el).text().toLowerCase().includes('starring'))
        .find('a')
        .map((i, el) => $(el).text().trim())
        .get()
        .join(', ');
    }

    // Get authors from "Written by" section (comma-separate-links)
    let authors = [];
    $('li.comma-seperate-links')
      .filter((i, el) => $(el).text().includes('Written by'))
      .each((i, el) => {
        $(el).find('a').each((j, authorEl) => {
          authors.push($(authorEl).attr('title').trim()); // Author names are in the 'title' attribute of links
        });
      });

    // Extract authors from "Adapted by" section (only if it exists)
    $('li.comma-seperate-links')
      .filter((i, el) => $(el).text().includes('Adapted by'))
      .each((i, el) => {
        $(el).find('a').each((j, authorEl) => {
          authors.push($(authorEl).attr('title').trim()); // Add names from "Adapted by" as well
        });
      });

    // Get release date from <div class="release-date"> and extract the year
    const releaseDateText = $('div.release-date').text().trim();
    const publishedYear = releaseDateText.match(/\b(\d{4})\b/);
    const year = publishedYear ? publishedYear[1] : null; // Extract the year if found

    // Get duration from the "Duration" row
    const duration = 
      $('li.no-line:contains("Duration:")').text().replace('Duration:','').trim() || null;

    // Get type from the "Product Format:" row
    const type =
       $('li.no-line:contains("Product Format:")').text().replace('Product Format:','').trim()  || null;

    // Extracting description from the active tab article
    const articleContent = $('.tab-content.active article');
    
    let currentStory = null;
    articleContent.find('p').each((i, el) => {
      const paragraphText = $(el).text().trim();
      const strongText = $(el).find('strong').text().trim();

      // Match the query against the story title (strong text)
      if (strongText) {
        if (strongText.toLowerCase().startsWith('note')) {
          console.log(`Skipping note: ${strongText}`);
          // Skip notes
        } else if (strongText.toLowerCase().includes(query.toLowerCase())) {
          console.log(`Found matching story: ${strongText}`);
          // if (currentStory) {
          //   description = currentStory;  // Store the previous story's description if query matches
          // }
          currentStory = {
            title: strongText,
            description: '',
          };
        }
      } else if (!strongText && currentStory) {
        // This isn't strong text, so we append to the current story's description
        console.log(`Appending to current story: ${paragraphText}`);
        currentStory.description += ' ' + paragraphText;
      } 
    });

    let description = null;
    let title = match.title;
    // If the last story matches the query, store it
    if (currentStory && currentStory.title.toLowerCase().includes(query.toLowerCase())) {
      console.log(`Final matching story: ${JSON.stringify(currentStory)}`);
      description = currentStory.description;
      
      // Now we need to extract numbering, title, and authors from the title
      const authorParts = currentStory.title.split('by');
      if (authorParts.length > 1) {
        authors = authorParts[1].trim().split(',').map(author => author.trim());
      }
      
      const numberAndTitleParts = authorParts[0].split(' ');
      
      title = numberAndTitleParts.slice(1).join(' ').trim(); // Join everything after the first part
    } else {
      description = articleContent.text().trim(); // Fallback to the entire article content if no match found
    }

    // Clean up the description: Ensure it's a string and remove unwanted text
    // console.log('Description before cleanup:', description);
    if (description && typeof description === 'string') {
      description = description.replace(/\*\*.*\*\*/, "").trim();
    }  
    
    // Get main cover image
    let cover = $('.detail-page-image img').attr('src') || match.cover;
    cover = cover ? this.baseUrl + cover : null;
    
    // Get the series's
    const releasesSeries = []
    let series = $('.product-desc h6').text().trim()
    const seriesParts = series.split(' - ')
    series = seriesParts.slice(1).join(' - ')

    let part = $('.product-desc h3').text().trim().split(' ')[0].split('.').filter(x => !!x)
    console.log(`Adding series: ${series} with part: ${part}`);
    
    if (part.length === 2) {
      // This means we have a sequence like "1.1" or "2.3"
      if (!series.endsWith(part[0])) {
        console.log(`Series "${series}" does not end with part "${part[0]}". Adjusting series name.`);
        releasesSeries.push({
          series: `${series} ${part[0]}`, sequence: Number.parseInt(part[1])
        });
        
        releasesSeries.push({
          series: series, sequence: Number.parseInt(part[0])
        })
      }
    } else {
      releasesSeries.push({
        series, sequence: Number.parseInt(part[0])
      })
    }
    
    
    if (currentStory) {
      // Shove the title into a series as well.
      console.log('Adding the title as a series')
      const numberParts = currentStory.title.split(' ');
      const numberSubparts = numberParts[0].split('.').filter(x => !!x);
      
      console.log(`Getting the sequence from the title: ${currentStory.title}`);
      console.log(`Number subparts: ${numberSubparts}`);
      console.log(`Number subparts length: ${numberSubparts.length}`);
      let sequence = part || 1;
      if (numberSubparts.length > 1 && Number.isInteger(Number.parseInt(numberSubparts[1]))) {
        console.log(`Using second part of number subparts: ${numberSubparts[1]}`);
        sequence = Number.parseInt(numberSubparts[1]);
      } else {
        console.log(`Using first part of number subparts: ${numberSubparts[0]}`);
        sequence = Number.parseInt(numberSubparts[0]);
      }
      releasesSeries.push({
        series: match.title,
        sequence,
      })
    } else {
      console.log('No current story found, not adding title as series');
    }
   

    const fullMetadata = {
      ...match,
      title,
      cover,
      narrator: narrators || null,  // Ensure narrators is null if empty
      duration,
      description: description ? description : null, // Only the story matching the query
      type,
      authors, // Authors array
      identifiers: {
        bigfinish: match.id,
      },
      publishedYear: year, // Adding the year to the publishedYear field
      publisher: "Big Finish Productions", // Always set publisher to "Big Finish Productions"
      series: releasesSeries,
    };

    console.log(`Full metadata for ${match.title}:`, JSON.stringify(fullMetadata, null, 2));
    return fullMetadata;
  } catch (error) {
    console.error(`Error fetching full metadata for ${match.title}:`, error.message, error.stack);
    return match; // Fallback to basic metadata
  }
}

}

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
      matches: results.matches.map(book => ({
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
