/*{
  "DESCRIPTION": "Ocean waves rolling horizontally with color transitions",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.8, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveHeight", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 },
    { "NAME": "waveFreq", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float wave1 = sin(uv.x * waveFreq * 3.14159 - TIME * speed * 2.0) * waveHeight * 0.3;
  float wave2 = sin(uv.x * waveFreq * 1.57079 + TIME * speed * 1.5) * waveHeight * 0.2;
  float wave3 = sin(uv.x * waveFreq * 2.36 + TIME * speed * 1.0) * waveHeight * 0.15;
  
  float waves = wave1 + wave2 + wave3;
  
  float yWarp = uv.y + waves * 0.5;
  yWarp = mod(yWarp, 1.0);
  
  float brightness = smoothstep(0.3, 0.5, yWarp) - smoothstep(0.5, 0.8, yWarp);
  brightness += sin(uv.x * waveFreq - TIME * speed) * 0.2;
  brightness = clamp(brightness, 0.0, 1.0);
  
  vec3 waveColor = mix(colorA.rgb, colorB.rgb, sin(TIME * speed * 0.5 + uv.x) * 0.5 + 0.5);
  
  vec3 finalColor = waveColor * (0.5 + brightness * 0.8);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
