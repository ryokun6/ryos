export const config = {
  runtime: "edge",
};

interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

// Helper function to check if URL is YouTube
function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(url);
}

// Helper function to extract YouTube video ID
function extractYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

// Helper function to get YouTube metadata using oEmbed API
async function getYouTubeMetadata(url: string): Promise<LinkMetadata> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // Use YouTube oEmbed API
  const oembedUrl = `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`;
  
  const response = await fetch(oembedUrl, {
    signal: AbortSignal.timeout(10000), // 10 second timeout
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube oEmbed data (${response.status})`);
  }

  const oembedData = await response.json();
  
  return {
    url: url,
    title: oembedData.title || `YouTube Video: ${videoId}`,
    description: `By ${oembedData.author_name || 'Unknown'} on YouTube`,
    image: oembedData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    siteName: "YouTube",
  };
}

export default async function handler(req: Request) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "No URL provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only allow HTTP and HTTPS URLs
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: "Only HTTP and HTTPS URLs are allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle YouTube URLs using oEmbed API
    if (isYouTubeUrl(url)) {
      try {
        const metadata = await getYouTubeMetadata(url);
        return new Response(JSON.stringify(metadata), {
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600" // Cache for 1 hour
          },
        });
      } catch (error) {
        console.error("Error fetching YouTube metadata:", error);
        // Fall back to general scraping if YouTube API fails
      }
    }

    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `HTTP error! status: ${response.status}` }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const html = await response.text();
    
    // Extract metadata from HTML
    const metadata: LinkMetadata = {
      url: url,
    };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim().replace(/\s+/g, ' ');
    }

    // Extract Open Graph tags
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogTitleMatch) {
      metadata.title = ogTitleMatch[1].trim();
    }

    const ogDescriptionMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogDescriptionMatch) {
      metadata.description = ogDescriptionMatch[1].trim();
    }

    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1].trim();
      // Make relative URLs absolute
      try {
        metadata.image = new URL(imageUrl, url).href;
      } catch {
        metadata.image = imageUrl;
      }
    }

    const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogSiteNameMatch) {
      metadata.siteName = ogSiteNameMatch[1].trim();
    }

    // Extract Twitter Card tags as fallback
    if (!metadata.title) {
      const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twitterTitleMatch) {
        metadata.title = twitterTitleMatch[1].trim();
      }
    }

    if (!metadata.description) {
      const twitterDescriptionMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twitterDescriptionMatch) {
        metadata.description = twitterDescriptionMatch[1].trim();
      }
    }

    if (!metadata.image) {
      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (twitterImageMatch) {
        const imageUrl = twitterImageMatch[1].trim();
        try {
          metadata.image = new URL(imageUrl, url).href;
        } catch {
          metadata.image = imageUrl;
        }
      }
    }

    // Extract standard meta description as fallback
    if (!metadata.description) {
      const metaDescriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (metaDescriptionMatch) {
        metadata.description = metaDescriptionMatch[1].trim();
      }
    }

    // Use hostname as fallback site name
    if (!metadata.siteName) {
      metadata.siteName = parsedUrl.hostname;
    }

    // Decode HTML entities
    const decodeHtml = (text: string) => {
      return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)));
    };

    // Clean up extracted text
    if (metadata.title) {
      metadata.title = decodeHtml(metadata.title);
    }
    if (metadata.description) {
      metadata.description = decodeHtml(metadata.description);
    }
    if (metadata.siteName) {
      metadata.siteName = decodeHtml(metadata.siteName);
    }

    return new Response(JSON.stringify(metadata), {
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600" // Cache for 1 hour
      },
    });

  } catch (error: unknown) {
    console.error("Error fetching link preview:", error);

    let status = 500;
    let errorMessage = "Error fetching link preview";

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Handle specific error types
      if (error.name === 'AbortError') {
        errorMessage = "Request timeout";
        status = 408;
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error";
        status = 503;
      }
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}