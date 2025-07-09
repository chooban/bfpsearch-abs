import axios from 'axios';
import * as cheerio from 'cheerio';

  
/**
 * @typedef {object} ProviderSource
 * @property {string} id - The unique identifier for the provider
 * @property {string} name - The name of the provider
 * @property {string} baseUrl - The base URL of the provider's website
 */
/**
  * @typedef {object} SearchMatch
  * @property {string} id - The unique identifier for the book
  * @property {string} title - The title of the book from search results (optional)
  * @property {string} url - The URL of the book from search results
  * @property {string} cover - The cover image URL of the book from search (optional)
  * @property {ProviderSource} source - The source information of the provider
*/
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
      const searchUrl = `${this.searchUrl}&search_term=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);

      const matches = [];
      const $books = $('.grid-box'); // Books are in this container

      $books.each((_index, element) => {
        const $book = $(element);
        
        const title = $book.find('.title').text().trim();
        const bookUrlElement = $book.find('.grid-content h3.title a');
        
        if (bookUrlElement.length > 0) {
          const relativeBookUrl = bookUrlElement.attr('href');
          let bookUrl = relativeBookUrl ? this.baseUrl + relativeBookUrl : null;
          
          if (bookUrl) {
            let cover = $book.find('.grid-pict img').attr('src');
            cover = cover ? this.baseUrl + cover : null;

            const id = $book.attr('data-item-id') || bookUrl.split('/').pop();
            
            matches.push({
              id,
              title: process.env.STRIP_TITLE === 'true' ? title.split(':').slice(1).join(":").trim() : title,
              url: bookUrl,
              cover,
            });
          } else {
            console.warn('No valid bookUrl found:', title);
          }

        } else {
          console.warn('No bookUrl element found:', title);
        }
      });

      const fullMetadata = await Promise.all(matches.map(match => {
        return this.getFullMetadata(match, query).then(fullMatch => {
          return {
            ...fullMatch,
            source: {
              id: this.id,
              description: this.name,
              link: this.baseUrl,
            },
          }
        });
      }));
      return { matches: fullMetadata };
    } catch (error) {
      console.error('Error searching books:', error.message, error.stack);
      return { matches: [] };
    }
  }
  /**
   * 
   * @param {SearchMatch} match - Information about search results from the previous step
   * @param {string} query - The query used when searching for a book
   * @returns 
   */
  async getFullMetadata(match, query = '') {
    try {
      const response = await axios.get(match.url);
      const $ = cheerio.load(response.data);

      // Try to find the "Cast" tab under <div id="tabs">
      let narrators = [];
      const castTabLink = $('#tabs ul li a')
        .filter((i, el) => $(el).text().trim() === 'Cast') // Look for the "Cast" link specifically
        .attr('href');

      if (castTabLink) {
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
        const strongTag = $(el).find('strong');
        const strongText = strongTag.text().trim();

        // Match the query against the story title (strong text)
        if (strongText) {
          if (strongText.toLowerCase().startsWith('note')) {
            // Skip notes
          } else if (strongText.toLowerCase().includes(query.toLowerCase()) && !strongTag.parent().is('a')) {
            currentStory = {
              title: strongText,
              description: '',
            };
          }
        } else if (!strongText && currentStory) {
          // This isn't strong text, so we append to the current story's description
          currentStory.description += ' ' + paragraphText;
        } 
      });

      const titleText = $('.product-desc h3').text().trim();
      const releaseTitle = titleText.split(':').slice(1).join(':').trim();

      let description = null;
      let title = '';
      // If the last story matches the query, store it
      if (currentStory && currentStory.title.toLowerCase().includes(query.toLowerCase())) {
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
        title = releaseTitle;
      }

      // Clean up the description: Ensure it's a string and remove unwanted text
      if (description && typeof description === 'string') {
        description = description.replace(/\*\*.*\*\*/, "").trim();
      }  
      
      // Get main cover image
      let cover = $('.detail-page-image img').attr('src');
      cover = cover ? this.baseUrl + cover : null;
      
      // Get the series's
      const releasesSeries = []
      let series = $('.product-desc h6').text().trim()
      if (series.indexOf('-') > -1) {
        const seriesParts = series.split(' - ')
        series = seriesParts.slice(1).join(' - ')
      }

      let sequenceParts = titleText.split(' ')[0].split('.').filter(x => !!x)
      
      if (sequenceParts.length === 2) {
        // This means we have a sequence like "1.1" or "2.3"
        if (!series.endsWith(sequenceParts[0])) {
          releasesSeries.push({
            series: `${series} - Volume ${sequenceParts[0]}`, 
            sequence: Number.parseInt(sequenceParts[1]).toString(),
          });
          
          // Also add a parent series, using the full x.x sequence
          releasesSeries.push({
            series: series, sequence: sequenceParts.join('.').toString(),
          })
        }
      } else {
        // If we start and end with a number, it's probably a subseries, but we don't know where
        const titleSplit = titleText.split(' ');
        if (Number.parseInt(titleSplit[titleSplit.length - 1])) {
          releasesSeries.push({
            series, sequence: null
          })
        } else {
          releasesSeries.push({
            series, sequence: Number.parseInt(sequenceParts[0]).toString()
          })
        }
      }
      
      
      if (currentStory) {
        // Shove the title into a series as well.
        const numberParts = currentStory.title.split(' ');
        const numberSubparts = numberParts[0].split('.').filter(x => !!x);
        
        let sequence = sequenceParts || 1;
        if (numberSubparts.length > 1 && Number.isInteger(Number.parseInt(numberSubparts[1]))) {
          sequence = Number.parseInt(numberSubparts[1]);
        } else {
          sequence = Number.parseInt(numberSubparts[0]);
        }
        releasesSeries.push({
          series: releaseTitle,
          sequence: sequence.toString(),
        })
      }     

      return {
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
    } catch (error) {
      return match; // Fallback to basic metadata
    }
  }

}

export default BigFinishProvider;
