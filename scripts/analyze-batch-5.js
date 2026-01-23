import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 5000,
  headers: {
    'User-Agent': 'TheSmallWeb/1.0',
  },
});

const urls = [
  "https://www.anildash.com/feed.xml",
  "https://spyglass.org/feed",
  "https://betterletter.substack.com/feed",
  "https://www.honest-broker.com/feed"
];

async function analyze() {
  console.log("Analyzing feeds (Batch 5)...");
  
  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url);
      console.log(`--- ${feed.title} ---`);
      console.log(`Feed URL: ${url}`);
      console.log(`Link: ${feed.link}`);
      console.log(`Description: ${feed.description}`);
      console.log(`Top 3 Posts:`);
      if (feed.items) {
        feed.items.slice(0, 3).forEach(item => {
          console.log(`  - ${item.title}`);
        });
      }
      console.log("");
    } catch (error) {
      console.log(`Error fetching ${url}: ${error.message}`);
      console.log("");
    }
  }
}

analyze();
