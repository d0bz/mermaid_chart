import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Project } from './pages/Project';
import { Chart } from './pages/Chart';
import { ChartRedirect } from './pages/ChartRedirect';
import { NotFound } from './pages/NotFound';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/c/:chartHash" element={<ChartRedirect />} />
        <Route path="/:projectHash" element={<Project />} />
        <Route path="/:projectHash/:chartHash" element={<Chart />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};
