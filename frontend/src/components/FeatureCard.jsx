import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const FeatureCard = memo(({ title, description, icon, route, delay = 0 }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(route);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        y: 0, 
        scale: 1,
        transition: {
          delay: delay,
          duration: 0.8,
          ease: "easeOut",
          type: "spring",
          stiffness: 100,
          damping: 15
        }
      }}
      whileHover={{ 
        scale: 1.05,
        y: -10,
        transition: {
          duration: 0.3,
          ease: "easeOut"
        }
      }}
      whileTap={{ 
        scale: 0.98,
        transition: {
          duration: 0.1
        }
      }}
      onClick={handleClick}
      className="group cursor-pointer relative"
    >
      <div className="relative bg-dark-secondary/80 backdrop-blur-sm border border-cyan-glow/30 rounded-xl p-4 h-40 w-56 mx-auto card-glow transition-all duration-300 hover:border-cyan-glow/60">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-glow/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Icon */}
        <motion.div
          whileHover={{ 
            rotate: 360,
            scale: 1.1,
            transition: { duration: 0.6, ease: "easeInOut" }
          }}
          className="text-3xl mb-3 text-center"
        >
          {icon}
        </motion.div>
        
        {/* Title */}
        <h3 className="text-lg font-semibold text-center mb-2 text-white group-hover:text-cyan-glow transition-colors duration-300">
          {title}
        </h3>
        
        {/* Description */}
        <p className="text-xs text-gray-300 text-center leading-relaxed group-hover:text-white transition-colors duration-300">
          {description}
        </p>
        
        {/* Hover effect overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 bg-gradient-to-t from-cyan-glow/10 to-transparent rounded-2xl pointer-events-none"
        />
        
        {/* Glow effect on hover */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          whileHover={{ 
            scale: 1.2, 
            opacity: 0.3,
            transition: { duration: 0.3 }
          }}
          className="absolute inset-0 bg-cyan-glow rounded-2xl blur-xl -z-10"
        />
      </div>
    </motion.div>
  );
});

FeatureCard.displayName = 'FeatureCard';

export default FeatureCard;
