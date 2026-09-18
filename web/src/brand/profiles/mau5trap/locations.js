/**
 * mau5trap LOCATION DATA — brand/profile data, not platform code.
 *
 * This is the legacy `FanHeatmap` region/city/venue centre table
 * (mau5trap-frontend-connected.html L988-1011) preserved VERBATIM, moved here rather than
 * deleted (architecture §14.1 "externalize, never remove"; PHASE_4A_HANDOFF.md §17 map
 * portability). The generic `components/maps/GeoHeatmap.jsx` contains no coordinate of its
 * own: it resolves a region name through the ACTIVE profile's `map.centers`, or plots
 * coordinates supplied with the dataset.
 *
 * The venue entries are label-specific intelligence (the rooms this label's audience is
 * measured in). They stay with the mau5trap profile and travel with it.
 */
export const centers = {
  'North America': [40, -100], Europe: [52, 20], Asia: [30, 100],
  'South America': [-15, -60], Oceania: [-25, 135], Africa: [0, 20],
  // Specific Cities
  'Los Angeles, US': [34.05, -118.24], 'New York, US': [40.71, -74.00],
  'Miami, US': [25.76, -80.19], 'Chicago, US': [41.87, -87.62],
  'Detroit, US': [42.33, -83.04], 'Denver, US': [39.73, -104.99],
  'San Francisco, US': [37.77, -122.41], 'Seattle, US': [47.60, -122.33],
  'Austin, US': [30.26, -97.74], 'Toronto, CA': [43.65, -79.38],
  'Montreal, CA': [45.50, -73.56], 'Vancouver, CA': [49.28, -123.12],
  'Mexico City, MX': [19.43, -99.13], 'London, UK': [51.50, -0.12],
  'Manchester, UK': [53.48, -2.24], 'Glasgow, UK': [55.86, -4.25],
  'Berlin, DE': [52.52, 13.40], 'Paris, FR': [48.85, 2.35],
  'Amsterdam, NL': [52.36, 4.90], 'Ibiza, ES': [38.90, 1.40],
  'Tokyo, JP': [35.67, 139.65], 'Seoul, KR': [37.56, 126.97],
  'Singapore, SG': [1.35, 103.81], 'Sydney, AU': [-33.86, 151.20],
  'Melbourne, AU': [-37.81, 144.96], 'Mumbai, IN': [19.07, 72.87],
  'Dubai, AE': [25.20, 55.27],
  'Sao Paulo, BR': [-23.55, -46.63], 'Buenos Aires, AR': [-34.60, -58.38],
  // Venues (Approx Coordinates)
  'Space, Ibiza': [38.90, 1.40], 'Ushuaia, Ibiza': [38.88, 1.40],
  'Berghain, Berlin': [52.51, 13.44], 'Fabric, London': [51.51, -0.10],
  'Ministry of Sound, London': [51.49, -0.09], 'Guvernment, Toronto': [43.64, -79.36],
  'Womb, Tokyo': [35.65, 139.69], 'Zouk, Singapore': [1.29, 103.83],
  'Palladium, Los Angeles': [34.09, -118.32], 'Red Rocks, Denver': [39.66, -105.20],
  'Output, NYC': [40.72, -73.95], 'Stereo, Montreal': [45.49, -73.58],
  'Warung, Brazil': [-26.95, -48.63], 'D-Edge, Sao Paulo': [-23.52, -46.66],
};

// Continents scatter across a wide box; a city/venue clusters tightly (legacy L1025-1027).
export const continents = ['North America', 'Europe', 'Asia', 'South America', 'Oceania', 'Africa'];

export default { centers, continents };
