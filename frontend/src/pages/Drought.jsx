import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function Drought() {
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
            transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
            className="text-5xl font-bold text-white mb-6 glow-text"
          >
            Drought Prediction 🏜️
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed"
          >
            Drought monitoring and agricultural impact assessment for better planning. 
            Track soil moisture, precipitation patterns, and water availability.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-12 p-8 bg-dark-secondary/50 border border-cyan-glow/30 rounded-2xl max-w-2xl mx-auto"
          >
            <p className="text-gray-400">
              Drought prediction functionality will be implemented here with soil moisture and precipitation monitoring.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
















