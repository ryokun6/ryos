// API status endpoint to check service availability
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if OpenAI API key is configured
  const openaiConfigured = !!process.env.OPENAI_API_KEY;

  // Return service status
  res.status(200).json({
    openai: openaiConfigured ? 'configured' : 'not configured'
  });
}
