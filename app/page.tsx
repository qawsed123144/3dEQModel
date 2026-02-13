'use client'
import { useState, useEffect } from "react";
import { lonLatToMapXY, mapWidth, mapHeight } from "@/utils/utils";

import Map from "@/components/Map";
import type { Earthquake, GeoJSONFeature, GeoJSONCollection, EarthquakeApi } from "@/types/type";
import testData from "@/data/testData.json";
import reportData from "@/data/reportData.json";
import gdmScatalogData from "@/data/GDMScatalog.json";

//import from db api
async function fetchDataset(name: string): Promise<Earthquake[]> {
  const res = await fetch(`/api/earthquakes?dataset=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows: EarthquakeApi[] = await res.json();
  return rows.map((row) => ({
    lat: row.lat,
    lon: row.lon,
    depth: row.depth_km ?? 0,
    amplitude: row.magnitude ?? 0,
    time: row.time,
  }));
}
// import from json data
function featureToPoint(feature: GeoJSONFeature): Earthquake {
  const [lon, lat] = feature.geometry.coordinates;

  const props = feature.properties;
  const depth = props.depth_km
  const magnitude = props.magnitude
  const time = props.time

  const point: Earthquake = { lat, lon, depth: depth, amplitude: magnitude, time };
  return point;
}
const parsedTestData = (testData as GeoJSONCollection).features
  .map(featureToPoint)
  .filter((p): p is Earthquake => p !== null);
const parsedReportData = (reportData as GeoJSONCollection).features
  .map(featureToPoint)
  .filter((p): p is Earthquake => p !== null);
const parsedGdmScatalogData = (gdmScatalogData as GeoJSONCollection).features
  .map(featureToPoint)
  .filter((p): p is Earthquake => p !== null);

export default function Home() {

  const [testData, setTestData] = useState<Earthquake[]>([]);
  const [reportData, setReportData] = useState<Earthquake[]>([]);
  const [gdmData, setGdmData] = useState<Earthquake[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Find outermost earthquake for highlighting
  const getOutermost = (data: Earthquake[]) => {
    if (data.length === 0) return null;
    const cx = mapWidth / 2;
    const cy = mapHeight / 2;
    return data.reduce((farthest, point) => {
      const { x, y } = lonLatToMapXY(point.lon, point.lat);
      const dist = (x - cx) ** 2 + (y - cy) ** 2;
      const { x: fx, y: fy } = lonLatToMapXY(farthest.lon, farthest.lat);
      const fDist = (fx - cx) ** 2 + (fy - cy) ** 2;
      return dist > fDist ? point : farthest;
    }, data[0]);
  };

  const maxTest = parsedTestData.find(p => Math.abs(p.lat - 24.95) < 0.01 && Math.abs(p.lon - 123.36) < 0.01) || getOutermost(parsedTestData);
  const maxReport = getOutermost(parsedReportData);
  const maxGdm = parsedGdmScatalogData.find(p => Math.abs(p.lat - 23.958) < 0.01 && Math.abs(p.lon - 123.302) < 0.01) || getOutermost(parsedGdmScatalogData);

  // fetch db api
  // useEffect(() => {
  //   let cancelled = false;
  //   async function loadData() {
  //     try {
  //       const [fetchedTestData, fetchedReportData, fetchedGdmData] = await Promise.all([
  //         fetchDataset("testData.json"),
  //         fetchDataset("reportData.json"),
  //         fetchDataset("GDMScatalog.json"),
  //       ]);
  //       if (!cancelled) {
  //         setTestData(fetchedTestData);
  //         setReportData(fetchedReportData);
  //         setGdmData(fetchedGdmData);
  //       }
  //     }
  //     catch (err) {
  //       if (!cancelled) {
  //         setError(err instanceof Error ? err.message : "Unknown error");
  //       }
  //     }
  //   }
  //   loadData();
  //   return () => {
  //     cancelled = true;
  //   }
  // }, [])
  //

  return (
    <>
      <div className="pageContainer">
        <main className="mainContainer">

          <div className="section">
            <div className="panel3D">
              <Map data={parsedTestData} highlightPoint={maxTest} />
            </div>
          </div>
          <div className="section">
            <div className="panel3D">
              <Map data={parsedReportData} highlightPoint={maxReport} />
            </div>
          </div>
          <div className="section">
            <div className="panel3D">
              <Map data={parsedGdmScatalogData} highlightPoint={maxGdm} />
            </div>
          </div>

          {/* import from db api */}
          {/* <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">3D 地震圖 Test</div>
              <div className="sectionSubtitle">testData.json</div>
            </div>
            <div className="panel3D">
              <Map data={testData} />
            </div>
          </section>

          <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">Report</div>
              <div className="sectionSubtitle">reportData.json</div>
            </div>
            <div className="panel3D">
              <Map data={reportData} />
            </div>
          </section>

          <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">GDMS Catalog</div>
              <div className="sectionSubtitle">GDMScatalog.json</div>
            </div>
            <div className="panel3D">
              <Map data={gdmData} />
            </div>
          </section> */}

          {error && <div style={{ color: "red" }}>API error: {error}</div>}
          {/*  */}

        </main>
      </div>

      <style jsx>{`
        .pageContainer {
          width: 100%;
          display: grid;
          grid-template-rows: 20px 1fr 20px;
          align-items: center;
          justify-items: center;
          min-height: 100svh;
          padding: 80px;
          gap: 64px;
          font-family: var(--font-geist-sans);
          background: rgba(220, 215, 200, 0.8);
        }

        .mainContainer{
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-items: center;
          gap: 32px;
          grid-row-start: 2;
        }

        .section {
          width: 100%;
          /* Removed border, background, and shadow for a cleaner look */
          padding: 20px 20px 16px 20px;
        }
        .sectionHeader {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 24px; /* Increased margin for better spacing */
        }
        
        .title {
          font-size: 22px;
          font-weight: 700;
          color: #334155; /* Darker text for contrast on light bg */
        }
        
        .subtitle {
          font-size: 13px;
          color: #64748b;
        }
        
        .panel3D {
          width: 100%;
          height: 600px;
          position: relative;
          border-radius: 16px; /* Slightly rounder for modern feel */
          overflow: hidden;
          /* Removed border */
        }
      `}</style>
    </>
  );
}
