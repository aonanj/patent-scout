export default function Head() {
  const canonical = "https://patent-scout.com/overview";
  const description =
    "Visualize IP overview information in the AI and ML patent landscape with clustering, signal scoring, and graph analytics to uncover uncrowded opportunity areas.";

  return (
    <>
      <title>IP Overview | Patent Scout</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}
