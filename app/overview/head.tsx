export default function Head() {
  const canonical = "https://www.synapse-ip.com/overview";
  const description =
    "Visualize IP overview information in the AI and ML patent landscape with clustering, signal scoring, and graph analytics to uncover uncrowded opportunity areas.";

  return (
    <>
      <title>IP Overview | SynapseIP</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}
