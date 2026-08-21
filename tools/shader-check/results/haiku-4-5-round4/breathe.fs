/*{
  "DESCRIPTION": "A slow breathing glow that pulses gently across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.5 },
    { "NAME": "breatheAmount", "TYPE": "float", "MIN": 0.2, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float breathe = sin(TIME * speed) * 0.5 + 0.5;
  breathe = mix(1.0 - breatheAmount, 1.0, breathe);
  
  float positionInfluence = sin((uv.x + TIME * speed * 0.25) * 3.14159) * 0.5 + 0.5;
  
  float intensity = breathe * (0.7 + positionInfluence * 0.3);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, positionInfluence);
  
  gl_FragColor = vec4(color * intensity, 1.0);
}
