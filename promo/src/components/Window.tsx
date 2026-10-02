import type React from 'react';
import {C, mono} from '../theme';

type WindowProps = {
	readonly title: string;
	readonly children: React.ReactNode;
	readonly style?: React.CSSProperties;
	readonly bodyStyle?: React.CSSProperties;
	readonly accent?: string;
};

// Glassy app-window chrome for the animated UI screens.
export const Window: React.FC<WindowProps> = ({title, children, style, bodyStyle, accent = C.blue}) => {
	return (
		<div
			style={{
				position: 'absolute',
				borderRadius: 28,
				background: 'linear-gradient(180deg, rgba(20,34,88,0.92), rgba(9,18,52,0.94))',
				border: `1.5px solid ${C.line}`,
				boxShadow: `0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 80px ${accent}22`,
				overflow: 'hidden',
				...style,
			}}
		>
			<div
				style={{
					height: 64,
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					padding: '0 26px',
					borderBottom: `1px solid ${C.line}`,
					background: 'rgba(255,255,255,0.03)',
				}}
			>
				<div style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF5F57'}} />
				<div style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#FEBC2E'}} />
				<div style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#28C840'}} />
				<div
					style={{
						flex: 1,
						textAlign: 'center',
						marginRight: 76,
						fontFamily: mono,
						fontSize: 24,
						color: C.dim,
						letterSpacing: 0.5,
					}}
				>
					{title}
				</div>
			</div>
			<div style={{padding: 30, ...bodyStyle}}>{children}</div>
		</div>
	);
};
