'use client'
import { useState, useEffect } from "react";

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

          <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">3D 地震圖 Test</div>
              <div className="sectionSubtitle">說明欄位...</div>
            </div>
            <div className="3DPanel">
              <Map data={parsedTestData} />
            </div>
          </section>
          <section className="section">
            <div className="3DPanel">
              <Map data={parsedReportData} />
            </div>
          </section>
          <section className="section">
            <div className="3DPanel">
              <Map data={parsedGdmScatalogData} />
            </div>
          </section>

          {/* import from db api */}
          {/* <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">3D 地震圖 Test</div>
              <div className="sectionSubtitle">testData.json</div>
            </div>
            <div className="3DPanel">
              <Map data={testData} />
            </div>
          </section>

          <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">Report</div>
              <div className="sectionSubtitle">reportData.json</div>
            </div>
            <div className="3DPanel">
              <Map data={reportData} />
            </div>
          </section>

          <section className="section">
            <div className="sectionHeader">
              <div className="sectionTitle">GDMS Catalog</div>
              <div className="sectionSubtitle">GDMScatalog.json</div>
            </div>
            <div className="3DPanel">
              <Map data={gdmData} />
            </div>
          </section> */}

          {error && <div style={{ color: "red" }}>API error: {error}</div>}
          {/*  */}

        </main>
      </div>

      <style jsx>{`
        .pageContainer {
          --gray-rgb: 0, 0, 0;
          --gray-alpha-200: rgba(var(--gray-rgb), 0.08);
          --gray-alpha-100: rgba(var(--gray-rgb), 0.05);

          --button-primary-hover: #383838;
          --button-secondary-hover: #f2f2f2;

          display: grid;
          grid-template-rows: 20px 1fr 20px;
          align-items: center;
          justify-items: center;
          min-height: 100svh;
          padding: 80px;
          gap: 64px;
          font-family: var(--font-geist-sans);
        }

        .mainContainer{
          display: flex;
          flex-direction: column;
          gap: 32px;
          grid-row-start: 2;
        }

        .section {
          width: min(1100px, 100%);
          background: rgba(var(--gray-rgb), 0.03);
          border: 1px solid var(--gray-alpha-200);
          border-radius: 12px;
          padding: 20px 20px 16px 20px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
        }
        .sectionHeader {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .title {
          font-size: 22px;
          font-weight: 700;
        }
        
        .subtitle {
          font-size: 13px;
          color: #6b7280;
        }
        
        .panel {
          border-radius: 10px;
          border: 1px solid var(--gray-alpha-200);
          overflow: hidden;
          background: var(--background);
        }
      `}</style>
    </>
  );
}
