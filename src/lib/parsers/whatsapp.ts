export interface ChatNode {
  timestamp: string;
  sender: string;
  message: string;
  isActionable: boolean;
  viscosityScore: number;
}

export interface TelemetryReport {
  nodes: ChatNode[];
  globalFriction: number;
  headPressureMinutes: number;
  systemViscosity: number;
}

export function parseWhatsAppLog(rawText: string): TelemetryReport {
  const lines = rawText.split('\n');
  const nodes: ChatNode[] = [];

  // Strict regex to catch standard WhatsApp timestamps: [DD/MM/YY, HH:MM:SS] Sender: Message
  const lineRegex = /^\[?(\d{2}\/\d{2}\/\d{2}),\s(\d{2}:\d{2}:\d{2})\]?\s([^:]+):\s(.*)$/;

  let totalContextSwitches = 1;
  let lastSender = '';
  let totalPressureMinutes = 0;
  let lastActionableTime: Date | null = null;

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;

    const [, date, time, sender, message] = match;
    const cleanSender = sender.trim();
    const cleanMessage = message.trim();

    // Normalize timestamp to ISO format
    const isoString = `20${date.split('/')[2]}-${date.split('/')[1]}-${date.split('/')[0]}T${time}Z`;
    const currentTime = new Date(isoString);

    // Operational Engineering Filter: Is this line an active task or a question?
    const actionIndicators = ['?', 'need', 'fix', 'check', 'update', 'status', 'deliver', 'task'];
    const isActionable = actionIndicators.some(word => cleanMessage.toLowerCase().includes(word));

    if (lastSender && cleanSender !== lastSender) {
      totalContextSwitches++;
    }

    // Track Head Pressure: Accumulate minutes an active task sits frozen
    if (isActionable) {
      if (!lastActionableTime) lastActionableTime = currentTime;
    } else if (lastActionableTime && cleanSender !== lastSender) {
      const deltaMinutes = (currentTime.getTime() - lastActionableTime.getTime()) / 60000;
      if (deltaMinutes > 0) totalPressureMinutes += deltaMinutes;
      lastActionableTime = null; // Reset pressure once pipeline moves
    }

    lastSender = cleanSender;

    nodes.push({
      timestamp: isoString,
      sender: cleanSender,
      message: cleanMessage,
      isActionable,
      viscosityScore: 0 // Will be scaled globally
    });
  }

  // Calculate System Dynamics Math
  const totalActions = nodes.filter(n => n.isActionable).length || 1;
  const systemViscosity = Math.log(totalContextSwitches + 1) * (nodes.length / totalActions);
  const globalFriction = Math.round(totalPressureMinutes * systemViscosity);

  // Apply localized viscosity scores back to individual nodes for UI warping
  const finalNodes = nodes.map(node => ({
    ...node,
    viscosityScore: node.isActionable ? systemViscosity * 1.5 : systemViscosity * 0.5
  }));

  return {
    nodes: finalNodes,
    globalFriction,
    headPressureMinutes: Math.round(totalPressureMinutes),
    systemViscosity: Math.round(systemViscosity * 10) / 10
  };
}
