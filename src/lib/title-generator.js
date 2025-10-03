import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate intelligent testimony titles using AI analysis
 * This function analyzes the full testimony content and creates meaningful titles
 * instead of just truncating the first line
 */
export async function generateIntelligentTitle(testimony) {
  try {
    // If this is a Twi language testimony with a manually provided title, keep it
    if (testimony.title && testimony.language === 'Twi') {
      console.log(`📝 Keeping manual Twi title: "${testimony.title}"`);
      return testimony.title;
    }

    // If we already have a good title that doesn't look like truncated text, keep it
    if (testimony.title && !isLikelyTruncatedTitle(testimony.title)) {
      console.log(`📝 Keeping existing good title: "${testimony.title}"`);
      return testimony.title;
    }

    console.log('🤖 Generating intelligent title for testimony...');
    
    const prompt = `You are a professional content curator for a church testimony library. Your job is to create compelling, accurate titles for personal testimonies.

TASK: Analyze the testimony content below and create an intelligent, meaningful title.

TITLE CREATION GUIDELINES:
1. READ THE ENTIRE testimony content - don't just use the first line
2. Identify the CORE MIRACLE/BREAKTHROUGH described in the story
3. Extract KEY CONCEPTS and MAIN THEME
4. Create a title that captures the ESSENCE of the testimony
5. Make it COMPELLING and SPECIFIC to this person's experience

TITLE REQUIREMENTS:
- Maximum 50 characters
- Focus on the OUTCOME/RESULT, not just the problem
- Use powerful, positive language
- Be specific to this testimony (not generic)
- Make it compelling enough that someone would want to watch/read

EXAMPLES OF GOOD TITLES:

SINGLE CATEGORY:
- Instead of: "I was sick and God healed me"
- Better: "Terminal Cancer Completely Disappeared" 
- Or: "Miraculous Healing from Stage 4 Cancer"

- Instead of: "I had financial problems and God helped"
- Better: "From Bankruptcy to 50 Million Contract"
- Or: "Unemployed to Triple Salary Breakthrough"

- Instead of: "My marriage was in trouble"
- Better: "Marriage Restored After 15 Years of Pain"
- Or: "From Divorce Papers to Renewed Love"

MULTI-CATEGORY (use pipe | separation):
- "Cancer Healed | University Admission | Visa Approved"
- "Job Promotion | Marriage Restored | Child Born"
- "Debt Cleared | House Purchased | Business Success"
- "Depression Lifted | Career Breakthrough"
- "Infertility Ended | Business Launched"

WHEN TO USE PIPES:
- Only for testimonies with MULTIPLE distinct miracles
- Each miracle should be from different life categories
- Don't use for related events (e.g., "Got Job | Got Promotion" - these are related)
- Do use for unrelated miracles (e.g., "Healed | Got Married | Visa Approved")

ANALYZE THIS TESTIMONY and extract the most compelling, specific outcome:

CATEGORY: ${testimony.category}
CONTENT: ${testimony.full_text || testimony.fullText || ''}

Your response should be ONLY the title, nothing else. Maximum 50 characters.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // Balance creativity with consistency
      max_tokens: 100, // We only need a short title
    });

    const generatedTitle = response.choices[0].message.content.trim();
    
    // Remove quotes if the AI added them
    const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '');
    
    // Ensure it's not too long
    const finalTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 47) + '...' : cleanTitle;
    
    console.log(`✨ Generated intelligent title: "${finalTitle}"`);
    console.log(`📊 Original vs New:`);
    console.log(`   Original: "${testimony.title || 'None'}"`);
    console.log(`   Enhanced: "${finalTitle}"`);
    
    return finalTitle;

  } catch (error) {
    console.error('❌ Error generating intelligent title:', error.message);
    
    // Fallback to original title or create a basic one
    if (testimony.title) {
      return testimony.title;
    }
    
    // Last resort: create a basic title from category
    return `${testimony.category} Testimony` || 'Personal Testimony';
  }
}

/**
 * Detect if a title looks like it was truncated from the first line
 * Common patterns: ends with "...", is exactly first X words, etc.
 */
function isLikelyTruncatedTitle(title) {
  if (!title) return true;
  
  // Check for common truncation indicators
  const truncationIndicators = [
    title.endsWith('...'),
    title.endsWith(' and'),
    title.endsWith(' but'),
    title.endsWith(' or'),
    title.endsWith(' so'),
    title.endsWith(' because'),
    title.length < 15 && title.split(' ').length <= 3, // Very short, generic titles
    title.toLowerCase().startsWith('i was') || title.toLowerCase().startsWith('i had'),
    title.includes('I want to thank God') && title.length > 30 // Starts with common opening
  ];
  
  return truncationIndicators.some(indicator => indicator);
}

/**
 * Learn from existing good titles to improve future generation
 * This function can analyze manually provided Twi titles to understand patterns
 */
export async function learnFromExistingTitles(existingTitles) {
  // This could be enhanced to analyze patterns in your manually created titles
  // For now, we'll use them as examples in the prompt
  
  const goodTitleExamples = existingTitles.filter(title => 
    title && 
    title.length > 10 && 
    !isLikelyTruncatedTitle(title)
  );
  
  console.log(`📚 Learning from ${goodTitleExamples.length} good title examples`);
  return goodTitleExamples;
}

/**
 * Enhanced version of the title generation that learns from existing patterns
 */
export async function generateTitleWithLearning(testimony, existingGoodTitles = []) {
  try {
    // If we have good examples, use them to improve the prompt
    const exampleTitles = existingGoodTitles.length > 0 
      ? `\n\nLEARN FROM THESE GOOD EXAMPLES:\n${existingGoodTitles.slice(0, 10).map(title => `"${title}"`).join('\n')}`
      : '';

    const prompt = `You are a professional content curator for a church testimony library. Your job is to create compelling, accurate titles for personal testimonies.

TASK: Analyze the testimony content below and create an intelligent, meaningful title.

TITLE CREATION GUIDELINES:
1. READ THE ENTIRE testimony content - don't just use the first line
2. Identify the CORE MIRACLE/BREAKTHROUGH described in the story
3. Extract KEY CONCEPTS and MAIN THEME
4. Create a title that captures the ESSENCE of the testimony
5. Make it COMPELLING and SPECIFIC to this person's experience

TITLE REQUIREMENTS:
- Maximum 50 characters
- Focus on the OUTCOME/RESULT, not just the problem
- Use powerful, positive language
- Be specific to this testimony (not generic)
- Make it compelling enough that someone would want to watch/read

EXAMPLES OF EXCELLENT PATTERNS:
- "From [Problem] to [Victory]" (e.g., "From Debt to Millions")
- "[Specific Condition] Completely Healed" (e.g., "Kidney Failure Reversed")
- "[Number] Years of [Problem] Ended" (e.g., "20 Years of Addiction Broken")
- "[Miraculous Result] After [Time]" (e.g., "Pregnancy After 10 Years")
- "[Specific Breakthrough] in [Time Period]" (e.g., "New Job in 2 Weeks")${exampleTitles}

ANALYZE THIS TESTIMONY and extract the most compelling, specific outcome:

CATEGORY: ${testimony.category}
CONTENT: ${testimony.full_text || testimony.fullText || ''}

Your response should be ONLY the title, nothing else. Maximum 50 characters.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2, // Lower temperature for more consistent results
      max_tokens: 100,
    });

    const generatedTitle = response.choices[0].message.content.trim();
    const cleanTitle = generatedTitle.replace(/^["']|["']$/g, '');
    const finalTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 47) + '...' : cleanTitle;
    
    console.log(`✨ Generated enhanced title: "${finalTitle}"`);
    return finalTitle;

  } catch (error) {
    console.error('❌ Error in enhanced title generation:', error.message);
    return generateIntelligentTitle(testimony); // Fallback to basic method
  }
}