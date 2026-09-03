// ==========================================================
// file: voiceProcessor.js (MOST SIMPLE EXTRACTION - NO KEYWORDS)
// ==========================================================

// 🚨 WARNING: Indha muraiyil, voice-ilirundhu sariyāṉa iḍam (Location) pirikkappaḍum eṉbadhu guarantee illai.
// Keywords alladhu NLP illāmal, Location-a identify seivadhu JavaScript-il sādhyamillai.

/**
 * Voice text-ilirundhu Accident Location Name-a pirikkum logic.
 *
 * @param {string} voiceText - User-in voice command-il irundhu maatrappatta text (e.g., "Accident near Guindy, come quick").
 * @returns {object|null} - {start: string, end: string, hazards: array} illaiyēl null.
 */
function extractAllFromVoice(voiceText) {
  const lowerText = voiceText.toLowerCase().trim();
  let dynamicHazards = [];

  // Simple attempt: Remove common emergency phrases and take the rest as the location.
  const cleanText = lowerText
    .replace(
      /accident|major|minor|happened|here|near|come|quick|fast|emergency|help|please|call|ambulan(ce)?/g,
      ""
    )
    .replace(/at|in|by|to|near/g, "") // Location prepositions
    .replace(/\s\s+/g, " ") // Remove multiple spaces
    .trim();

  // Take the cleaned text as the potential location
  const endLocation = cleanText;

  // --- 2. Validation & Output ---
  if (endLocation && endLocation.length > 3) {
    // Minimum 4 letters for a place
    // START is a placeholder for the Ambulance's real-time GPS location
    const startPlaceholder = "Current Ambulance Location (GPS)";

    // Hazards are empty from voice; script.js will use DEFAULT_HAZARDS.
    return {
      start: startPlaceholder,
      end: endLocation.charAt(0).toUpperCase() + endLocation.slice(1),
      hazards: dynamicHazards,
    };
  }

  // Address extraction fail aanaal
  return null;
}

/**
 * script.js-ilirundhu aḻaikkappaṭum mukkiyamāna function.
 *
 * @param {string} transcribedText - voice-ilirundhu maatrappatta text.
 */
export async function getRouteDataFromVoice(transcribedText) {
  if (!transcribedText) {
    console.log("Transcribed text is empty.");
    return null;
  }

  console.log(`Processing voice command: "${transcribedText}"`);

  // 🔥 Extraction Logic-a aḻaikkiṟōm.
  return extractAllFromVoice(transcribedText);
}
