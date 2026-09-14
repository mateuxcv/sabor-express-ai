import type { Metadata } from "next";
import { ProjectCover } from "@/components/project-cover";

export const metadata: Metadata = {
  title: "Sabor Express · Sinta-se em casa",
  description: "Entre no restaurante Sabor Express. Explore o salão em 3D, escolha sua mesa, acompanhe um pedido e converse com a Lia em uma experiência interativa.",
};

export default function Home() {
  return <ProjectCover />;
}
