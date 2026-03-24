import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fil from './fil.json';
import bisaya from './bisaya.json';

// Read language from localStorage synchronously to avoid flash of untranslated content
const savedLanguage =
  typeof window !== 'undefined'
    ? localStorage.getItem('language') || 'fil'
    : 'fil';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fil: { translation: fil },
    bisaya: { translation: bisaya },
  },
  lng: savedLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
