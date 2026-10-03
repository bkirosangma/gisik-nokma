'use client';

import dynamic from 'next/dynamic';
import { WorkflowBuilderLoading } from '../skeletons/route-loading.js';

/**
 * The workflow canvas, loaded when a builder route renders it (smoothness T10; spec D6, S9). `@xyflow/react` and the whole builder are
 * the heaviest code outside the editor; the two builder routes import the screen from here, through its own `./workflow-builder`
 * subpath, so the route's shell (nav, breadcrumb, the load states) paints without them. `ssr: false`: the canvas measures the DOM.
 */
export const WorkflowBuilderScreen = dynamic(
  () => import('@gisik-nokma/app-core/workflow-builder').then((module) => module.WorkflowBuilderScreen),
  { ssr: false, loading: () => <WorkflowBuilderLoading /> },
);
