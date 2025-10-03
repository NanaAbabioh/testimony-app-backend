import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Detect if a testimony contains multiple distinct concepts/miracles
 * and create appropriate pipe-separated titles
 */
export async function detectAndFormatMultiConcepts(testimony) {
  try {
    const content = testimony.full_text || testimony.fullText || '';
    
    if (!content || content.length < 100) {
      return { isMultiConcept: false, title: testimony.title };
    }

    console.log(`🔍 Analyzing testimony for multiple concepts...`);

    const prompt = `You are analyzing a church testimony to identify if it contains MULTIPLE distinct miracles/breakthroughs that span different life categories.

TASK: Analyze this testimony and determine:
1. Does it contain multiple DISTINCT miracles/breakthroughs?
2. If yes, what are the separate concepts?

CRITERIA FOR MULTIPLE CONCEPTS:
- Must be distinct miracles in DIFFERENT life areas
- Examples: Health + Career, Marriage + Finances, Healing + Education
- NOT multiple related events (e.g., "got job then promotion" = single career concept)

CATEGORIES TO CONSIDER:
- Healing/Health
- Financial/Business
- Career/Employment  
- Marriage/Relationships
- Family/Children
- Education/Academic
- Legal/Immigration
- Spiritual/Deliverance
- Housing/Property

RESPONSE FORMAT:
If single concept: {"multiConcept": false, "title": "Single compelling title"}
If multiple concepts: {"multiConcept": true, "title": "Concept 1 | Concept 2 | Concept 3"}

EXAMPLES:
Single concept: {"multiConcept": false, "title": "Stage 4 Cancer Completely Healed"}
Multiple concepts: {"multiConcept": true, "title": "Cancer Healed | University Admission | Visa Approved"}

TESTIMONY CONTENT:
${content}

CURRENT CATEGORY: ${testimony.category}

Analyze and respond with JSON only:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 200,
    });

    const result = response.choices[0].message.content.trim();
    
    try {
      const parsed = JSON.parse(result);
      
      if (parsed.multiConcept && parsed.title) {
        console.log(`✨ Multi-concept detected: "${parsed.title}"`);
        return {
          isMultiConcept: true,
          title: parsed.title,
          concepts: parsed.title.split(' | ').map(c => c.trim())
        };
      } else {
        console.log(`📝 Single concept: "${parsed.title}"`);
        return {
          isMultiConcept: false,
          title: parsed.title || testimony.title
        };
      }
      
    } catch (parseError) {
      console.warn('⚠️ Could not parse multi-concept response, using fallback');
      return { isMultiConcept: false, title: testimony.title };
    }

  } catch (error) {
    console.error('❌ Error in multi-concept detection:', error.message);
    return { isMultiConcept: false, title: testimony.title };
  }
}

/**
 * Enhanced title generation that specifically handles multi-concept testimonies
 */
export async function generateMultiConceptTitle(testimony) {
  try {
    // First detect if this is a multi-concept testimony
    const analysis = await detectAndFormatMultiConcepts(testimony);
    
    if (analysis.isMultiConcept) {
      // Validate the pipe-separated title
      const title = analysis.title;
      
      // Ensure it's not too long (accounting for pipe separators)
      if (title.length > 50) {
        // Shorten individual concepts
        const concepts = analysis.concepts || title.split(' | ');
        const shortenedConcepts = concepts.map(concept => {
          return concept.length > 15 ? concept.substring(0, 12) + '...' : concept;
        });
        
        const shortenedTitle = shortenedConcepts.join(' | ');
        
        if (shortenedTitle.length <= 50) {
          return shortenedTitle;
        } else {
          // If still too long, take first 2-3 concepts
          const limitedConcepts = shortenedConcepts.slice(0, Math.min(3, concepts.length));
          return limitedConcepts.join(' | ');
        }
      }
      
      return title;
      
    } else {
      // Single concept - use regular title generation
      const { generateIntelligentTitle } = await import('./title-generator.js');
      return await generateIntelligentTitle(testimony);
    }
    
  } catch (error) {
    console.error('❌ Error in multi-concept title generation:', error.message);
    
    // Fallback to original title
    return testimony.title || `${testimony.category} Testimony`;
  }
}

/**
 * Validate pipe-separated titles to ensure they make sense
 */
export function validateMultiConceptTitle(title) {
  if (!title || !title.includes(' | ')) {
    return { isValid: true, title };
  }
  
  const concepts = title.split(' | ').map(c => c.trim());
  
  // Validation rules
  const issues = [];
  
  if (concepts.length < 2) {
    issues.push('Not enough distinct concepts for pipe separation');
  }
  
  if (concepts.length > 4) {
    issues.push('Too many concepts - limit to 4 for clarity');
  }
  
  // Check for very similar concepts
  const similarConcepts = findSimilarConcepts(concepts);
  if (similarConcepts.length > 0) {
    issues.push(`Similar concepts should be combined: ${similarConcepts.join(', ')}`);
  }
  
  if (issues.length > 0) {
    console.warn('⚠️ Multi-concept title validation issues:', issues);
    // Return cleaned up version
    const cleanedConcepts = concepts.slice(0, 3); // Limit to 3 concepts
    return { 
      isValid: false, 
      title: cleanedConcepts.join(' | '),
      issues 
    };
  }
  
  return { isValid: true, title };
}

/**
 * Find concepts that might be too similar to warrant separation
 */
function findSimilarConcepts(concepts) {
  const similar = [];
  
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const concept1 = concepts[i].toLowerCase();
      const concept2 = concepts[j].toLowerCase();
      
      // Check for related terms
      const relatedPairs = [
        ['job', 'promotion'], ['job', 'career'], ['work', 'employment'],
        ['marriage', 'wedding'], ['child', 'pregnancy'], ['baby', 'birth'],
        ['money', 'financial'], ['debt', 'loan'], ['business', 'company']
      ];
      
      for (const [term1, term2] of relatedPairs) {
        if ((concept1.includes(term1) && concept2.includes(term2)) ||
            (concept1.includes(term2) && concept2.includes(term1))) {
          similar.push(`"${concepts[i]}" and "${concepts[j]}"`);
        }
      }
    }
  }
  
  return [...new Set(similar)]; // Remove duplicates
}