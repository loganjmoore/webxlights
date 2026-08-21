/*{
  "DESCRIPTION": "Pulsing red and gold Christmas lights with festive twinkling",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.84, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "twinkleDensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  float pulse = sin(TIME * speed) * 0.5 + 0.5;
  
  float cellX = floor(uv.x * 8.0);
  float cellY = floor(uv.y * 8.0);
  float seed = sin(cellX * 12.9898 + cellY * 78.233) * 43758.5453;
  float twinkle = fract(seed + TIME * speed * 2.0);
  twinkle = smoothstep(0.0, twinkleDensity, twinkle) * smoothstep(1.0, 1.0 - twinkleDensity, twinkle);
  
  float brightness = mix(pulse, twinkle, 0.3);
  
  float alternate = mod(cellX + cellY, 2.0);
  vec3 baseColor = mix(colorA.rgb, colorB.rgb, alternate);
  
  vec3 finalColor = baseColor * (0.4 + brightness * 0.6);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
