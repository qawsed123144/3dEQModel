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
      <div>
        <main>

          <section>
            <div>
              <div>3D 地震圖 Test</div>
              <div>說明欄位...</div>
            </div>
            <div>
              <Map data={parsedTestData} />
            </div>
          </section>

        </main>
      </div>
    </>
  );
}
