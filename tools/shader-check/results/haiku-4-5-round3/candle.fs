/*{
  "DESCRIPTION": "Warm candle flicker with dancing flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorFlame", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.2, 1.0] },
    { "NAME": "colorGlow", "TYPE": "color", "DEFAULT": [1.0, 0.3, 0.0, 1.0] },
    { "NAME": "flickerSpeed", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "flameHeight", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float centerX = 0.5;
  float distFromCenter = abs(uv.x - centerX);
  
  float flicker1 = sin(TIME * flickerSpeed * 0.7 + uv.x * 3.0) * 0.5 + 0.5;
  float flicker2 = sin(TIME * flickerSpeed * 1.1 + uv.x * 2.5 + 10.0) * 0.5 + 0.5;
  float flicker3 = sin(TIME * flickerSpeed * 0.9 + uv.x * 4.0 + 20.0) * 0.5 + 0.5;
  
  float combinedFlicker = flicker1 * 0.4 + flicker2 * 0.35 + flicker3 * 0.25;
  combinedFlicker = mix(0.6, 1.0, combinedFlicker);
  
  float flameWidth = 0.15 + sin(TIME * flickerSpeed * 0.8) * 0.05;
  float flameFalloff = smoothstep(flameWidth, 0.0, distFromCenter);
  
  float heightFalloff = smoothstep(1.0, flameHeight * 0.3, uv.y);
  
  float intensity = flameFalloff * heightFalloff * combinedFlicker;
  
  vec3 flameColor = mix(colorFlame.rgb, colorGlow.rgb, 0.4);
  vec3 finalColor = flameColor * intensity;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
