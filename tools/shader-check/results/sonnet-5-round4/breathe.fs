/*{
  "DESCRIPTION": "A slow breathing glow that pulses gently between two colours",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.3, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.6 },
    { "NAME": "intensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.85 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float breath = 0.5 + 0.5 * sin(TIME * speed * 0.8);
  breath = smoothstep(0.0, 1.0, breath);

  float vign = 1.0 - 0.35 * abs(uv.x - 0.5) * 2.0;
  vign = clamp(vign, 0.0, 1.0);

  vec3 baseColor = mix(colorA.rgb, colorB.rgb, breath);

  float glow = mix(0.35, 1.0, breath) * mix(0.6, 1.0, vign) * intensity;

  vec3 finalColor = baseColor * glow;

  gl_FragColor = vec4(finalColor, 1.0);
}
