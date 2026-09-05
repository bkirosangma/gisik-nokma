import 'react-native-get-random-values'; // ulidx needs crypto.getRandomValues on RN — MUST be first
import { registerRootComponent } from 'expo';
import { App } from './src/app.js';

registerRootComponent(App);
