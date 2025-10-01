import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import WeatherForecastCard from '../components/WeatherForecastCard';

export default function Forecast() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6"
      >
        <button
          onClick={() => navigate('/')}
          className="text-cyan-glow hover:text-white transition-colors duration-300 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Back to Home</span>
        </button>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="container mx-auto px-6 py-12"
      >
        <div className="text-center">
          <motion.h1
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 100 }}
            className="text-5xl font-bold text-white mb-6 glow-text"
          >
            Weather Forecast 🌤️
          </motion.h1>

          {/* Weather Forecast Card (new design) */}
          <div className="max-w-3xl mx-auto mt-6">
            <WeatherForecastCard />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

