import PDFDocument from 'pdfkit';
import { storagePut } from '../storage';

interface FichaData {
  companyName: string;
  companyCnpj: string;
  employeeName: string;
  employeeCpf: string;
  employeeCargo: string;
  employeeSetor: string;
  employeeMatricula: string;
  epiNome: string;
  epiCa: string;
  quantidade: number;
  dataEntrega: string;
  motivo: string;
  observacoes: string;
  deliveryId: number;
  companyId: number;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export async function generateEpiFichaPdf(data: FichaData): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          const key = `epi-fichas/${data.companyId}/${data.deliveryId}-${Date.now()}.pdf`;
          const { url } = await storagePut(key, pdfBuffer, 'application/pdf');
          resolve(url);
        } catch (err) {
          reject(err);
        }
      });

      const pageWidth = doc.page.width - 80;

      doc.rect(40, 40, pageWidth, 60).fill('#1a365d');
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
        .text('FICHA DE ENTREGA DE EPI', 50, 55, { width: pageWidth - 20, align: 'center' });
      doc.fontSize(9).font('Helvetica')
        .text('Equipamento de Proteção Individual — NR-6', 50, 75, { width: pageWidth - 20, align: 'center' });

      doc.fillColor('#333333');

      let y = 120;

      doc.rect(40, y, pageWidth, 25).fill('#f0f4f8');
      doc.fillColor('#1a365d').fontSize(11).font('Helvetica-Bold')
        .text('DADOS DA EMPRESA', 50, y + 7);
      y += 30;

      doc.fillColor('#333333').fontSize(9).font('Helvetica');
      doc.text(`Empresa: ${data.companyName}`, 50, y);
      doc.text(`CNPJ: ${data.companyCnpj}`, 350, y);
      y += 20;

      doc.rect(40, y, pageWidth, 25).fill('#f0f4f8');
      doc.fillColor('#1a365d').fontSize(11).font('Helvetica-Bold')
        .text('DADOS DO FUNCIONÁRIO', 50, y + 7);
      y += 30;

      doc.fillColor('#333333').fontSize(9).font('Helvetica');
      doc.text(`Nome: ${data.employeeName}`, 50, y);
      doc.text(`Matrícula: ${data.employeeMatricula || '-'}`, 350, y);
      y += 16;
      doc.text(`CPF: ${data.employeeCpf}`, 50, y);
      doc.text(`Cargo: ${data.employeeCargo || '-'}`, 250, y);
      doc.text(`Setor: ${data.employeeSetor || '-'}`, 400, y);
      y += 25;

      doc.rect(40, y, pageWidth, 25).fill('#f0f4f8');
      doc.fillColor('#1a365d').fontSize(11).font('Helvetica-Bold')
        .text('EQUIPAMENTO ENTREGUE', 50, y + 7);
      y += 35;

      const colWidths = [pageWidth * 0.35, pageWidth * 0.15, pageWidth * 0.15, pageWidth * 0.15, pageWidth * 0.20];
      const headers = ['EPI', 'C.A.', 'Qtd', 'Data', 'Motivo'];

      doc.rect(40, y - 5, pageWidth, 20).fill('#e2e8f0');
      doc.fillColor('#1a365d').fontSize(8).font('Helvetica-Bold');
      let xPos = 50;
      headers.forEach((h, i) => {
        doc.text(h, xPos, y, { width: colWidths[i] });
        xPos += colWidths[i];
      });
      y += 20;

      doc.fillColor('#333333').fontSize(9).font('Helvetica');
      xPos = 50;
      const vals = [data.epiNome, data.epiCa || '-', String(data.quantidade), formatDate(data.dataEntrega), data.motivo || '-'];
      vals.forEach((v, i) => {
        doc.text(v, xPos, y, { width: colWidths[i] });
        xPos += colWidths[i];
      });
      y += 25;

      if (data.observacoes) {
        doc.fontSize(8).fillColor('#666666').text(`Observações: ${data.observacoes}`, 50, y);
        y += 20;
      }

      y += 20;
      doc.rect(40, y, pageWidth, 25).fill('#f0f4f8');
      doc.fillColor('#1a365d').fontSize(11).font('Helvetica-Bold')
        .text('DECLARAÇÃO', 50, y + 7);
      y += 35;

      doc.fillColor('#333333').fontSize(8).font('Helvetica');
      const declaration = `Declaro que recebi o(s) equipamento(s) de proteção individual acima descrito(s), em perfeito estado de conservação e funcionamento, comprometendo-me a:

1. Usar o EPI apenas para a finalidade a que se destina;
2. Responsabilizar-me pela guarda e conservação do equipamento;
3. Comunicar ao empregador qualquer alteração que o torne impróprio para uso;
4. Devolver o EPI ao término do contrato de trabalho ou quando solicitado.

Estou ciente de que o uso do EPI é obrigatório conforme a NR-6 e que o descumprimento poderá acarretar penalidades previstas na CLT.`;
      doc.text(declaration, 50, y, { width: pageWidth - 20, lineGap: 3 });
      y += 130;

      y += 30;
      const sigWidth = (pageWidth - 60) / 2;

      doc.moveTo(50, y).lineTo(50 + sigWidth, y).stroke('#999999');
      doc.moveTo(50 + sigWidth + 60, y).lineTo(50 + sigWidth + 60 + sigWidth, y).stroke('#999999');

      y += 8;
      doc.fontSize(8).fillColor('#666666');
      doc.text('Assinatura do Funcionário', 50, y, { width: sigWidth, align: 'center' });
      doc.text('Assinatura do Responsável', 50 + sigWidth + 60, y, { width: sigWidth, align: 'center' });

      y += 30;
      doc.fontSize(7).fillColor('#999999')
        .text(`Documento gerado automaticamente pelo ERP Gestão Integrada — ID #${data.deliveryId} — ${new Date().toLocaleString('pt-BR')}`, 50, y, { width: pageWidth - 20, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
