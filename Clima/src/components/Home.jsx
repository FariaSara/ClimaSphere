import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import EarthScene from './EarthScene';
import IntroText from './IntroText';
import FeatureCard from './FeatureCard';
import EarthGuardInsightsCard from './EarthGuardInsightsCard';

export default function Home() {
  const [showIntroText, setShowIntroText] = useState(false);
  const [introTextCompleted, setIntroTextCompleted] = useState(false);

  // Start showing intro text when component mounts (Earth starts moving)
  useEffect(() => {
    setShowIntroText(true);
  }, []);

  const handleIntroTextComplete = () => {
    setIntroTextCompleted(true);
  };

  // Feature cards data
  const featureCards = [
    {
      title: "Weather Forecast",
      description: "Real-time weather predictions using NASA and NOAA data for accurate forecasting",
      icon: "🌤️",
      route: "/forecast"
    },
    {
      title: "Flood Prediction",
      description: "Advanced flood monitoring and early warning systems for community safety",
      icon: "🌊",
      route: "/flood"
    },
    {
      title: "Cyclone Prediction",
      description: "Hurricane and cyclone tracking with detailed path predictions and intensity analysis",
      icon: "🌀",
      route: "/cyclone"
    },
    {
      title: "Bushfire Prediction",
      description: "Map-based bushfire risk per Australian state using NASA datasets",
      icon: "🔥",
      route: "/bushfire"
    },
    {
      title: "Earth Guard Insights",
      description: "Educational content about climate science and NASA's role in disaster resilience",
      icon: "🛡️",
      route: "/education"
    }
  ];

  return (
    <div className="min-h-screen bg-dark-bg relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-bg via-dark-secondary/50 to-dark-bg" />
      
      {/* Animated title */}
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.8 }}
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
        className="absolute top-8 inset-x-0 z-20 w-full flex justify-center"
      >
        <motion.h1
          animate={{
            textShadow: [
              "0 0 10px #00FFFF, 0 0 20px #00FFFF, 0 0 30px #00FFFF",
              "0 0 20px #00FFFF, 0 0 30px #00FFFF, 0 0 40px #00FFFF",
              "0 0 10px #00FFFF, 0 0 20px #00FFFF, 0 0 30px #00FFFF"
            ]
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="text-4xl md:text-6xl font-bold text-center text-white glow-text"
        >
          ClimaSphere 🌍
        </motion.h1>
      </motion.div>

      {/* 3D Earth Scene */}
      <div className="absolute inset-0 z-0">
        <EarthScene />
      </div>

      {/* Intro Text Overlay */}
      {showIntroText && !introTextCompleted && (
        <IntroText 
          isVisible={showIntroText} 
          onComplete={handleIntroTextComplete}
        />
      )}

      {/* Feature Cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ 
          opacity: introTextCompleted ? 1 : 0.3,
          transition: {
            duration: 0.8,
            ease: "easeOut"
          }
        }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 w-full max-w-7xl px-4"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-5 justify-items-center">
          {featureCards.map((card, index) => (
            card.title === 'Earth Guard Insights' ? (
              <EarthGuardInsightsCard key={card.title} delay={introTextCompleted ? index * 0.1 : 0} />
            ) : (
              <FeatureCard
                key={card.title}
                title={card.title}
                description={card.description}
                icon={card.icon}
                route={card.route}
                delay={introTextCompleted ? index * 0.1 : 0}
              />
            )
          ))}
        </div>
      </motion.div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 pointer-events-none z-5">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              opacity: 0
            }}
            animate={{
              y: [null, -20, 20, -10, 10, 0],
              opacity: [0, 0.3, 0.1, 0.2, 0.1, 0],
              scale: [0.5, 1, 0.8, 1.2, 0.9, 0.5]
            }}
            transition={{
              duration: 8 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "easeInOut"
            }}
            className="absolute w-1 h-1 bg-cyan-glow rounded-full"
            style={{
              boxShadow: '0 0 6px #00FFFF'
            }}
          />
        ))}
      </div>

      {/* Scroll indicator */}
      {introTextCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: 1, 
            y: 0,
            transition: {
              delay: 0.5,
              duration: 0.8
            }
          }}
          className="absolute bottom-4 right-8 z-20"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="text-cyan-glow text-sm font-light"
          >
            Explore Features ↓
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
