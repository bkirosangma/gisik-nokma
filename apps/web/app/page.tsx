import { HomeScreen } from '../src/home/home-screen.js';
import { documentTitleFor } from '../src/page-title.js';

/** Home (Knowledge Graph spec E): a SERVER page so `metadata` is honoured (a `'use client'` page's would be ignored). */
export const metadata = { title: documentTitleFor('Home') };

export default function Home() {
  return <HomeScreen />;
}
