import React, { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const IntroText = memo(({ isVisible, onComplete }) => {
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Show text after a short delay when Earth starts moving
      const timer = setTimeout(() => {
        setShowText(true);
      }, 1000);

      // Auto-hide text after 2 minutes (120 seconds)
      const hideTimer = setTimeout(() => {
        setShowText(false);
        setTimeout(() => {
          onComplete && onComplete();
        }, 1000); // Wait for exit animation
      }, 120000);

      return () => {
        clearTimeout(timer);
        clearTimeout(hideTimer);
      };
    }
  }, [isVisible, onComplete]);

  const introText = "SphereGuardians develops an AI-powered weather app using NASA and NOAA data to deliver timely forecasts and alerts. Our mission is to empower communities with real-time updates, flood prediction, cyclone tracking, and drought monitoring. We aim to raise awareness of NASA's role in disaster resilience while providing educational insights that enhance preparedness and reduce climate-related risks.";

  return (
    <AnimatePresence>
      {showText && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: {
              duration: 1.2,
              ease: "easeOut",
              type: "spring",
              stiffness: 100,
              damping: 15
            }
          }}
          exit={{ 
            opacity: 0, 
            y: -30, 
            scale: 0.95,
            transition: {
              duration: 0.8,
              ease: "easeIn"
            }
          }}
          className="absolute inset-0 flex items-center justify-center pointer-events-auto z-10 cursor-pointer"
          role="button"
          aria-label="Dismiss introductory message"
          onClick={() => {
            setShowText(false);
            setTimeout(() => {
              onComplete && onComplete();
            }, 250);
          }}
        >
          <div className="max-w-4xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                transition: {
                  delay: 0.3,
                  duration: 0.8,
                  ease: "easeOut"
                }
              }}
              className="bg-black/60 backdrop-blur-sm border border-cyan-glow/30 rounded-xl p-4 md:p-5 shadow-2xl"
              style={{
                boxShadow: '0 0 40px rgba(0, 255, 255, 0.2), inset 0 0 20px rgba(0, 255, 255, 0.1)'
              }}
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: 1,
                  transition: {
                    delay: 0.6,
                    duration: 1,
                    ease: "easeOut"
                  }
                }}
                className="text-sm md:text-base text-center text-white leading-relaxed md:leading-loose font-light"
                style={{
                  textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
                }}
              >
                {introText}
              </motion.p>
              
              {/* Decorative elements */}
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ 
                  scaleX: 1,
                  transition: {
                    delay: 0.8,
                    duration: 1.5,
                    ease: "easeOut"
                  }
                }}
                className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-glow to-transparent mt-6"
              />
              
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  transition: {
                    delay: 1.2,
                    duration: 0.6,
                    ease: "easeOut"
                  }
                }}
                className="flex justify-center mt-4"
              >
                <div className="flex space-x-2">
                  {[...Array(3)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 1, 0.5]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.3,
                        ease: "easeInOut"
                      }}
                      className="w-2 h-2 bg-cyan-glow rounded-full"
                      style={{
                        boxShadow: '0 0 10px #00FFFF'
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

IntroText.displayName = 'IntroText';

export default IntroText;
