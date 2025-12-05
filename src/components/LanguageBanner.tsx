export const LanguageBanner = () => {
  const languages = [
    "🇺🇸 English",
    "🇪🇸 Spanish", 
    "🇫🇷 French",
    "🇩🇪 German",
    "🇵🇹 Portuguese",
    "🇮🇹 Italian",
    "🇷🇺 Russian",
    "🇯🇵 Japanese",
    "🇰🇷 Korean",
    "🇨🇳 Chinese",
    "🇦🇪 Arabic",
    "🇮🇳 Hindi",
    "🇹🇷 Turkish",
    "🇵🇱 Polish",
    "🇳🇱 Dutch",
    "🇸🇪 Swedish",
    "🇳🇴 Norwegian",
    "🇩🇰 Danish",
    "🇫🇮 Finnish",
    "🇬🇷 Greek",
  ];

  // Duplicate the languages array exactly 2x for seamless infinite scroll
  const duplicatedLanguages = [...languages, ...languages];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 backdrop-blur-sm border-t border-primary/20 py-3 overflow-hidden z-40">
      <div className="flex animate-infinite-scroll whitespace-nowrap">
        {duplicatedLanguages.map((language, index) => (
          <div
            key={index}
            className="inline-flex items-center px-6 text-sm font-medium text-foreground/80"
          >
            {language}
            <span className="mx-4 text-primary">•</span>
          </div>
        ))}
      </div>
    </div>
  );
};
