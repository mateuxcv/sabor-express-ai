import type { Metadata } from 'next';
import { Presentation } from '@/components/presentation/presentation';
import './presentation.css';
import './responsive.css';

export const metadata: Metadata = {
  title: 'Customer Success & IA Solutions — HeadOffice.ai | Sabor Express',
  description: 'Um piloto controlado. Atendimento mais rápido. Equipes no controle. Apresentação interativa de 19 minutos.',
};

export default function PresentationPage() {
  return <Presentation />;
}
