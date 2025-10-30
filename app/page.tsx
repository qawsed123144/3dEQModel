'use client'
import Map from "@/components/Map";
import testData from "./data/testData.json";
import type { Earthquake, GeoJSONFeature, GeoJSONCollection } from "@/types/type";

function featureToPoint(feature: GeoJSONFeature): Earthquake {
  const [lon, lat] = feature.geometry.coordinates;

  const props = feature.properties;
  const depth = props.depth_km
  const magnitude = props.magnitude
  const time = (() => {
    const iso = props.time.includes("T") ? props.time : props.time.replace(" ", "T");
    const normalized = iso.endsWith("Z") ? iso : `${iso}Z`;
    const parsed = new Date(normalized);
    return parsed;
  })()

  const point: Earthquake = { lat, lon, depth: depth, amplitude: magnitude, time };
  return point;
}
const parsedTestData = (testData as GeoJSONCollection).features
  .map(featureToPoint)
  .filter((p): p is Earthquake => p !== null);

export default function Home() {

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
