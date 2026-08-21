/*{
  "DESCRIPTION": "American flag waving in the wind with stars and stripes",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "waveAmplitude", "TYPE": "float", "MIN": 0.0, "MAX": 0.3, "DEFAULT": 0.1 },
    { "NAME": "waveFrequency", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float waveOffset = sin(uv.y * waveFrequency * 3.14159 + TIME * speed) * waveAmplitude;
  float distortedX = uv.x + waveOffset;
  
  vec3 color = vec3(0.0);
  
  if (distortedX < 0.0 || distortedX > 1.0) {
    color = vec3(0.0);
  } else if (distortedX < 0.2) {
    float starY = mod(uv.y * 9.0, 1.0);
    float starX = mod(distortedX * 45.0, 1.0);
    float star = step(0.8, starX) * step(0.8, starY);
    color = mix(vec3(0.0, 0.0, 0.3), vec3(1.0, 1.0, 1.0), star);
  } else {
    float stripeIndex = mod(floor(uv.y * 13.0), 2.0);
    if (stripeIndex < 0.5) {
      color = vec3(1.0, 0.0, 0.0);
    } else {
      color = vec3(1.0, 1.0, 1.0);
    }
  }
  
  gl_FragColor = vec4(color, 1.0);
}
