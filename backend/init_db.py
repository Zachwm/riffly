from .database import engine, Base
from .models import Riff, Interaction  

Base.metadata.create_all(bind=engine)

print("✅ All tables created")