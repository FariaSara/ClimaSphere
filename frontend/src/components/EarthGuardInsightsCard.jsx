import React, { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Hardcoded insights data
const insightsData = [
  {
    question: "How does NASA provide real-time weather information?",
    answer:
      "Global climate data is gathered by NASA satellites and integrated into MERRA-2 (Modern-Era Retrospective Analysis for Research and Applications, version-2) and other reanalysis models. Values like temperature, wind, humidity, and clouds are then made available using the POWER API. This enables us to convert unprocessed scientific data into user-friendly weather categories.",
    links: [
      "https://gmao.gsfc.nasa.gov/gmao-products/merra-2/",
      "https://power.larc.nasa.gov/docs/services/api/"
    ]
  },
  {
    question: "How can NASA data help predict floods?",
    answer:
      "When heavy rainfall meets already-saturated soil, flooding frequently results. SMAP satellites detect soil moisture, while NASA's GPM mission delivers rainfall data in almost real-time. When taken as a whole, they provide scientists with a clear picture of the locations and times of floods.",
    links: [
      "https://smap.jpl.nasa.gov/",
      "https://gpm.nasa.gov/missions/GPM",
      "https://youtu.be/dfcr-4XmxNY?si=1nmbSwdYuwrvYMS-"
    ]
  },
  {
    question: "How is NASA data used in disaster response and planning?",
    answer:
      "NASA offers satellite observations in near real-time to help with quick response during disasters like hurricanes or floods. In the long run, the same data helps communities become more resilient by informing planning for climate adaptation, agriculture, and water management.",
    links: [
      "https://climate.nasa.gov/news/3070/major-earth-satellite-to-track-disasters-effects-of-climate-change/",
      "https://appliedsciences.nasa.gov/what-we-do/disasters"
    ]
  },
  {
    question: "How does NASA monitor cyclones?",
    answer:
      "NASA satellites gather data on wind, precipitation, and storms from space. Geostationary and polar-orbiting satellites are mainly used to monitor cyclones. Together, the CYGNSS mission and GPM improve cyclone monitoring and forecast by measuring surface winds inside storms and rainfall intensity, respectively.",
    links: [
      "https://www.preventionweb.net/news/how-are-scientists-tracking-cyclone-alfred#:~:text=Polar%2Dorbiting%20satellites%20move%20across%20the%20Earth%20north,south%2C%20and%20pass%20close%20to%20the%20poles.",
      "https://youtu.be/bei0s3m6vcY?si=eI_D_DFOhvAh-7at"
    ]
  },
  {
    question: "How does NASA monitor drought conditions?",
    answer:
      "NASA tracks drought from space using a number of satellites. GRACE-FO finds subsurface water storage, MODIS monitors vegetative health, and SMAP measures soil moisture. When combined, these findings provide a comprehensive picture of both short- and long-term drought.",
    links: [
      "https://gracefo.jpl.nasa.gov/",
      "https://terra.nasa.gov/about/terra-instruments/modis",
      "https://smap.jpl.nasa.gov/"
    ]
  },
  {
    question: "How does NASA measure global rainfall?",
    answer:
      "NASA’s Global Precipitation Measurement (GPM) mission uses advanced satellites to measure rainfall and snowfall worldwide. These observations help improve weather forecasting and monitor extreme events like hurricanes and monsoons.",
    links: ["https://gpm.nasa.gov/missions/GPM"]
  },
  {
    question: "How does NASA track clouds and storms?",
    answer:
      "Satellites like MODIS (on Terra and Aqua) and GOES capture cloud images and storm movements every few minutes. This allows scientists to monitor storm growth and intensity in real time.",
    links: [
      "https://terra.nasa.gov/about/terra-instruments/modis",
      "https://www.nesdis.noaa.gov/news/how-noaa-satellites-help-us-stay-ahead-of-severe-weather-season#:~:text=GOES%20satellites%20each%20carry%20an,storms%20in%20near%20real%2Dtime."
    ]
  },
  {
    question: "How does soil moisture data help in flood prediction?",
    answer:
      "NASA’s SMAP mission measures soil moisture globally. If soil is already saturated, even moderate rainfall can lead to flooding, making this data key for flood risk forecasting.",
    links: ["https://smap.jpl.nasa.gov/"]
  },
  {
    question: "How is groundwater monitored during droughts?",
    answer:
      "NASA’s GRACE-FO satellites detect changes in Earth’s gravity caused by shifting underground water storage. This reveals how much groundwater is being depleted during drought.",
    links: ["https://gracefo.jpl.nasa.gov/"]
  },
  {
    question: "How are NASA APIs used by developers?",
    answer:
      "APIs like NASA POWER provide weather and solar radiation data for apps. Developers can build tools for forecasting, agriculture, and renewable energy planning.",
    links: ["https://power.larc.nasa.gov/"]
  },
  {
    question: "How is NASA data used after disasters?",
    answer:
      "Post-disaster, NASA provides satellite-based damage maps to guide recovery. These maps show destroyed roads, buildings, and flooded areas.",
    links: [
      "https://www.geographyrealm.com/developing-damage-proxy-maps-satellite-data/",
      "https://ntrs.nasa.gov/api/citations/20210011959/downloads/28498.pdf"
    ]
  }
];

const EarthGuardInsightsCard = memo(function EarthGuardInsightsCard({ delay = 0 }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);

  const toggle = (index) => {
    setActiveIndex((prev) => (prev === index ? null : index));
  };

  return (
    <>
      {/* Base card (click to open overlay) */}
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { delay } }}
        transition={{ duration: 0.8, ease: 'easeOut', type: 'spring', stiffness: 100, damping: 15 }}
        whileHover={{ scale: 1.05, y: -10 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(true)}
        className="group cursor-pointer relative"
      >
        <div className="relative bg-dark-secondary/80 backdrop-blur-sm border border-cyan-glow/30 rounded-xl p-4 h-40 w-56 mx-auto card-glow transition-all duration-300 hover:border-cyan-glow/60">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-glow/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <motion.div className="text-3xl mb-3 text-center" whileHover={{ rotate: 360, scale: 1.1 }}>
            🛡️
          </motion.div>

          <h3 className="text-lg font-semibold text-center mb-2 text-white group-hover:text-cyan-glow transition-colors duration-300">
            Earth Guard Insights
          </h3>

          <p className="text-xs text-gray-300 text-center leading-relaxed group-hover:text-white transition-colors duration-300">
            Explore NASA-powered Q&A on weather and disasters
          </p>

          <motion.div initial={{ opacity: 0 }} whileHover={{ opacity: 1 }} className="absolute inset-0 bg-gradient-to-t from-cyan-glow/10 to-transparent rounded-2xl pointer-events-none"/>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} whileHover={{ scale: 1.2, opacity: 0.3 }} className="absolute inset-0 bg-cyan-glow rounded-2xl blur-xl -z-10" />
        </div>
      </motion.div>

      {/* Overlay with accordion (keeps other cards/layout untouched) */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
              className="relative max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan-glow/30 bg-dark-secondary/95 backdrop-blur-md shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between bg-dark-secondary/95 px-5 py-3 border-b border-cyan-glow/20">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🛡️</span>
                  <h2 className="text-xl font-semibold text-white">Earth Guard Insights</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-cyan-glow/30 px-3 py-1 text-sm text-white hover:border-cyan-glow/60 hover:text-cyan-glow transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Content: Accordion list */}
              <div className="max-h-[75vh] overflow-y-auto p-4 space-y-3">
                {insightsData.map((item, idx) => {
                  const isOpen = activeIndex === idx;
                  return (
                    <div key={idx} className="rounded-lg border border-cyan-glow/20 bg-dark-bg/60">
                      <button
                        onClick={() => toggle(idx)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-white hover:text-cyan-glow"
                      >
                        <span className="font-medium">{item.question}</span>
                        <motion.span
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-cyan-glow"
                        >
                          ▼
                        </motion.span>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key="content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="overflow-hidden px-4"
                          >
                            <div className="py-3 text-gray-200">
                              <p className="mb-3 leading-relaxed text-sm md:text-base">{item.answer}</p>
                              {item.links && item.links.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {item.links.map((href, i) => (
                                    <a
                                      key={i}
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md border border-cyan-glow/30 px-2 py-1 text-xs text-cyan-300 hover:text-cyan-200 hover:border-cyan-glow/60 transition-colors"
                                    >
                                      <span className="truncate max-w-[14rem] md:max-w-none">{new URL(href).hostname}</span>
                                      <span aria-hidden>↗</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

EarthGuardInsightsCard.displayName = 'EarthGuardInsightsCard';

export default EarthGuardInsightsCard;
