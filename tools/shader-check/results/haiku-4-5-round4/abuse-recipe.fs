/*{
  "DESCRIPTION": "Warm chocolate and cream colors swirl and pulse with holiday cheer",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.6, 0.3, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.8, 0.6, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Adjust for roofline displays
  vec2 pos = uv * scale;
  if (RENDERSIZE.y < 2.0) {
    pos.x = uv.x * scale + TIME * speed * 0.5;
    pos.y = uv.y * scale;
  } else {
    pos.x = uv.x * scale + TIME * speed * 0.25;
    pos.y = uv.y * scale + TIME * speed * 0.15;
  }
  
  // Create swirling waves with multiple frequencies
  float wave1 = sin(pos.x * 1.5 + TIME * speed * 0.8) * 0.5 + 0.5;
  float wave2 = cos(pos.y * 1.2 - TIME * speed * 0.6) * 0.5 + 0.5;
  float wave3 = sin((pos.x + pos.y) * 0.8 + TIME * speed) * 0.5 + 0.5;
  
  // Combine waves for swirling effect
  float blend = (wave1 + wave2 + wave3) / 3.0;
  
  // Add pulsing variation
  float pulse = sin(TIME * speed * 1.2) * 0.3 + 0.7;
  blend *= pulse;
  
  // Mix chocolate and cream colors
  vec3 finalColor = mix(colorA.rgb, colorB.rgb, blend);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
