export default function Head() {
  const canonical = "https://patent-scout.com/whitespace";
  const description =
    "Visualize whitespace in the AI and ML patent landscape with clustering, signal scoring, and graph analytics to uncover uncrowded opportunity areas.";

  return (
    <>
      <title>Whitespace Analysis | Patent Scout</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

