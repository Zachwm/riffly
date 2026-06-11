from ..core.database import engine, Base
from ..core.models import Riff, Interaction  

Base.metadata.create_all(bind=engine)

print("✅ All tables created")