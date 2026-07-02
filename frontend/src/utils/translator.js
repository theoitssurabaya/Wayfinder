export const translateName = (name, lang, nameEn) => {
  if (!name) return "";
  if (lang === 'en' && nameEn) return nameEn;
  
  let translated = name;
  

  const ordinals = ["Zero", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth"];

  if (lang === 'en') {
    // Ubah Lantai X -> First Floor, Second Floor, dll.
    const floorMatch = translated.match(/Lantai\s+(\d+)/i);
    if (floorMatch) {
      const num = parseInt(floorMatch[1], 10);
      if (num > 0 && num < ordinals.length) {
        translated = translated.replace(/Lantai\s+\d+/i, `${ordinals[num]} Floor`);
      } else {
        translated = translated.replace(/Lantai\s+(\d+)/i, `Floor $1`);
      }
    }

    // Ubah Gedung -> Building
    translated = translated.replace(/Gedung/i, 'Building');
  } else if (lang === 'id') {


    // Ubah First Floor -> Lantai 1
    const floorMatchEn = translated.match(/([a-zA-Z]+)\s+Floor/i);
    if (floorMatchEn) {
      const word = floorMatchEn[1];
      const num = ordinals.findIndex(o => o.toLowerCase() === word.toLowerCase());
      if (num > 0) {
        translated = translated.replace(new RegExp(`${word}\\s+Floor`, 'i'), `Lantai ${num}`);
      }
    }
    const floorMatchNum = translated.match(/Floor\s+(\d+)/i);
    if (floorMatchNum) {
      translated = translated.replace(/Floor\s+(\d+)/i, `Lantai $1`);
    }

    // Ubah Building -> Gedung
    translated = translated.replace(/Building/i, 'Gedung');
  }

  return translated;
};
