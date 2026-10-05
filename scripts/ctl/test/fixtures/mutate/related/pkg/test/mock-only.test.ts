import { vi } from 'vitest';
import { C } from '../src/consumer.js';
vi.mock('../src/target.js');
void C;
